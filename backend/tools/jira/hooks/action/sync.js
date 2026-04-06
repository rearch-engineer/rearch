import SubResource from '../../../../models/SubResource.js';
import onImport from '../import.js';

export default async function onSync(job) {
  const name = job.name;

  console.log(`Jira Sync Hook triggered for subResource: `);

  const {
    subResource, 
    parentResource,
  } = job.data;

  const data = await onImport(job, parentResource, subResource);

  // Only update the 'data' field - preserve user-edited 'description' field
  await SubResource.updateOne(
    { _id: subResource._id },
    { $set: { data } }
  ).exec();

  return {
    success: true,
    message: `Jira Sync Hook completed for subResource: ${subResource._id}`,
  };
}
