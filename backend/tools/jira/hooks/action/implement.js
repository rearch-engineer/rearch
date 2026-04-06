import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import Handlebars from 'handlebars';

import SubResource from '../../../../models/SubResource.js';
import Skill from '../../../../models/Skill.js';
import Resource from '../../../../models/Resource.js';
import FlowPersonas from '../../../../models/FlowPersona.js';
import { broadcast } from '../../../../ws.js';

import {
  prepareCopy,
  execute,
  cleanup
} from '../../../../utils/opencode.js';

export default async function onImplement(job, { log } = {}) {
  const _log = log || ((msg) => job.log(msg));

  await _log('Starting implement action hook');

  const name = job.name;

  const {
    subResource, 
    parentResource,
    payload
  } = job.data;


  const {
    skill,
    implementationRepository
  } = payload;

  await _log('Fetching necessary data from database');

  const subResourceDoc = await SubResource.findById(subResource._id).exec();
  const skillDoc = await Skill.findById(skill).exec();
  const implementationRepositoryDoc = implementationRepository ? await Resource.findById(implementationRepository).exec() : null;
  const flowPersonas = await FlowPersonas.find({
    active: true,
  }).exec();

  // log implementationRepository
  await _log(`Implementation Repository obj for ${implementationRepository}: ${JSON.stringify(implementationRepositoryDoc)}`);

  await _log('Processing flow personas with Gemini AI');

  // Clear existing flow data
  subResourceDoc.flow = [];

  // Process each flow persona sequentially
  for (const persona of flowPersonas) {
    // Log current persona processing
    await _log(`Processing persona: ${persona.title}`);

    // Compile handlebars template
    const template = Handlebars.compile(persona.prompt);
    
    // Build previous outputs object using slugs as keys
    const previousOutputs = {};
    for (const flowItem of subResourceDoc.flow) {
      if (flowItem.slug) {
        previousOutputs[flowItem.slug] = flowItem.output;
      }
    }
    
    // Replace variables: description + all previous persona outputs
    const processedPrompt = template({
      description: subResource.data.description || '',
      ...previousOutputs
    });

    await _log(`Generated prompt for persona: ${persona.title}: ${processedPrompt}`);
    
    let output;

    // Check if this persona requires code execution
    if (persona.code) {
      await _log(`Using OpenCode for code-capable persona: ${persona.title}`);
      
      let prep;

      const ocOpts = {
        skill: skillDoc,
        resource: parentResource,
        subresource: subResourceDoc,
        implementationRepository: implementationRepositoryDoc,
        persona,
        prompt: processedPrompt,
        log: _log
      };
      
      try {
        // Prepare temporary workspace
        
        prep = await prepareCopy(job, ocOpts);
        await _log(`Prepared workspace for OpenCode execution`);
        
        // Execute OpenCode session
        const response = await execute(job, prep, ocOpts);
        await _log(`Received response from OpenCode for persona: ${persona.title}`);
        
        // Stringify the response for storage
        output = JSON.stringify(response);
      } finally {
        // Always cleanup, even if there was an error
        if (prep) {
          await cleanup(job, prep, ocOpts);
          await _log(`Cleaned up OpenCode workspace`);
        }
      }
    } else {
      await _log(`Using Gemini AI for non-code persona: ${persona.title}`);
      
      // Call Gemini AI
      const result = await generateText({
        model: google('gemini-2.5-pro'),
        system: persona.systemPrompt,
        prompt: processedPrompt
      });

      await _log(`Received response from Gemini AI for persona: ${persona.title}`);
      
      output = result.text;
    }
    
    // Store in flow array
    subResourceDoc.flow.push({
      persona: persona._id,
      slug: persona.slug,
      output: output
    });

    // Save updated subResource
    await subResourceDoc.save();

    // Broadcast WebSocket event for real-time updates
    try {
      broadcast('subresource.flow', {
        subresourceId: subResource._id.toString(),
        persona: persona._id.toString(),
        output: output,
        passes: Math.random() < 0.5 // Random boolean for now
      });
      await _log(`Broadcast WebSocket event for persona: ${persona.title}`);
    } catch (error) {
      await _log(`Failed to broadcast WebSocket event: ${error.message}`);
    }
  }

  return {
    subResource, 
    parentResource,
    name,
    payload
  };
}
