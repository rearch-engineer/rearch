/**
 * Seed script: creates 10 categories with 10 prompts each, with placeholder images.
 * Run with: bun run seed-prompts.mjs
 */
import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import 'dotenv/config';

// ─── Models (inline to avoid import issues) ──────────────────────────────────

const categorySchema = new mongoose.Schema({
  name: String,
  slug: { type: String, unique: true },
  description: String,
  order: { type: Number, default: 0 },
}, { timestamps: true });

const promptSchema = new mongoose.Schema({
  title: String,
  prompt: String,
  icon: { type: String, default: 'SmartToyOutlined' },
  iconColor: { type: String, default: '#6b7280' },
  imageFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'SuggestedPromptCategory' },
  order: { type: Number, default: 0 },
}, { timestamps: true });

const Category = mongoose.model('SuggestedPromptCategory', categorySchema);
const Prompt = mongoose.model('SuggestedPrompt', promptSchema);

// ─── Placeholder image generator (minimal BMP) ──────────────────────────────

function createPlaceholderImage(width, height, r, g, b) {
  // Create a minimal valid PNG with a single color
  // Using a simple approach: create a BMP buffer
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const buf = Buffer.alloc(fileSize);

  // BMP header
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10); // pixel data offset
  // DIB header
  buf.writeUInt32LE(40, 14); // DIB header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26); // color planes
  buf.writeUInt16LE(24, 28); // bits per pixel
  buf.writeUInt32LE(pixelDataSize, 34);

  // Pixel data (BGR)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = 54 + y * rowSize + x * 3;
      buf[offset] = b;
      buf[offset + 1] = g;
      buf[offset + 2] = r;
    }
  }
  return buf;
}

// ─── Seed data ───────────────────────────────────────────────────────────────

const ICONS = [
  'CodeOutlined', 'BarChartOutlined', 'SearchOutlined', 'BuildOutlined',
  'BugReportOutlined', 'ScienceOutlined', 'RocketLaunchOutlined', 'SecurityOutlined',
  'StorageOutlined', 'AnalyticsOutlined', 'CloudOutlined', 'TerminalOutlined',
  'SchoolOutlined', 'LightbulbOutlined', 'AutoAwesomeOutlined', 'SpeedOutlined',
  'DataObjectOutlined', 'HubOutlined', 'TuneOutlined', 'InsightsOutlined',
];

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#06b6d4',
];

const IMAGE_COLORS = [
  [239, 68, 68], [249, 115, 22], [234, 179, 8], [34, 197, 94], [20, 184, 166],
  [59, 130, 246], [99, 102, 241], [168, 85, 247], [236, 72, 153], [6, 182, 212],
];

const categories = [
  { name: 'Sales & CRM', slug: 'sales-crm', description: 'Sales pipeline and CRM automation prompts' },
  { name: 'Data & Analytics', slug: 'data-analytics', description: 'Data analysis and visualization prompts' },
  { name: 'Engineering', slug: 'engineering', description: 'Software engineering and development prompts' },
  { name: 'DevOps & Infrastructure', slug: 'devops-infra', description: 'CI/CD, deployment, and infrastructure prompts' },
  { name: 'Security & Compliance', slug: 'security-compliance', description: 'Security auditing and compliance prompts' },
  { name: 'Product & Design', slug: 'product-design', description: 'Product management and design prompts' },
  { name: 'Marketing & Content', slug: 'marketing-content', description: 'Marketing automation and content creation' },
  { name: 'Customer Support', slug: 'customer-support', description: 'Support ticket handling and knowledge base' },
  { name: 'Finance & Operations', slug: 'finance-ops', description: 'Financial analysis and operations prompts' },
  { name: 'AI & Machine Learning', slug: 'ai-ml', description: 'ML model training, evaluation, and deployment' },
];

const promptsByCategory = [
  // Sales & CRM
  [
    { title: 'RFP and proposal drafter', prompt: 'Draft a comprehensive RFP response based on the client requirements document. Include executive summary, technical approach, timeline, and pricing sections.' },
    { title: 'Competitive battle cards', prompt: 'Create competitive battle cards comparing our product against the top 3 competitors. Include pricing, features, strengths, and weaknesses.' },
    { title: 'QBR prep agent', prompt: 'Prepare a Quarterly Business Review presentation for the client. Include usage metrics, ROI analysis, and recommendations for expansion.' },
    { title: 'CRM knowledge search', prompt: 'Search the CRM for all interactions with this account in the last 90 days and summarize key themes and action items.' },
    { title: 'HubSpot deal search', prompt: 'Find all open deals in HubSpot with a close date in the next 30 days and flag any that are at risk based on activity patterns.' },
    { title: 'Lead enrichment pipeline', prompt: 'Enrich the imported lead list with company data, social profiles, and technographic information from available sources.' },
    { title: 'Sales email sequence', prompt: 'Create a 5-email outbound sequence targeting VP-level prospects in the fintech industry. Focus on compliance pain points.' },
    { title: 'Win/loss analysis', prompt: 'Analyze our closed deals from last quarter and identify the top 3 factors that correlated with wins vs losses.' },
    { title: 'Territory mapping', prompt: 'Map out the sales territory assignments based on account size, industry, and geographic location. Identify coverage gaps.' },
    { title: 'Pipeline forecasting', prompt: 'Generate a pipeline forecast for next quarter based on current deal stages, historical conversion rates, and seasonal trends.' },
  ],
  // Data & Analytics
  [
    { title: 'SQL query builder', prompt: 'Write an optimized SQL query to analyze customer churn patterns over the last 12 months, broken down by cohort and plan type.' },
    { title: 'Dashboard designer', prompt: 'Design a KPI dashboard layout for the executive team. Include revenue, churn, NPS, and product usage metrics with drill-down capabilities.' },
    { title: 'Data pipeline auditor', prompt: 'Audit the existing data pipeline for bottlenecks, data quality issues, and suggest optimizations to reduce processing time.' },
    { title: 'A/B test analyzer', prompt: 'Analyze the results of our latest A/B test. Calculate statistical significance, effect size, and provide a recommendation.' },
    { title: 'ETL workflow builder', prompt: 'Design an ETL workflow to ingest data from our 5 main sources, transform it, and load it into the analytics warehouse.' },
    { title: 'Anomaly detection setup', prompt: 'Set up anomaly detection rules for our key business metrics. Define thresholds and alert conditions for each metric.' },
    { title: 'Report automation', prompt: 'Automate the weekly stakeholder report by pulling data from our analytics platform and formatting it into a presentation.' },
    { title: 'Data catalog builder', prompt: 'Create a data catalog documenting all tables, columns, relationships, and data lineage for our main database.' },
    { title: 'Cohort analysis', prompt: 'Perform a cohort analysis on user signups from the last 6 months. Track retention, engagement, and revenue per cohort.' },
    { title: 'Metric definition guide', prompt: 'Define and document all business metrics including calculation methodology, data sources, and ownership for each metric.' },
  ],
  // Engineering
  [
    { title: 'Code review assistant', prompt: 'Review the latest pull request for code quality, security vulnerabilities, performance issues, and adherence to our coding standards.' },
    { title: 'Architecture diagram', prompt: 'Generate a system architecture diagram for our microservices. Include service dependencies, data flows, and infrastructure components.' },
    { title: 'API documentation', prompt: 'Generate comprehensive API documentation for our REST endpoints including request/response examples, error codes, and authentication.' },
    { title: 'Test suite generator', prompt: 'Generate unit tests and integration tests for the user authentication module. Aim for 90% code coverage.' },
    { title: 'Refactoring planner', prompt: 'Analyze the codebase for technical debt and create a prioritized refactoring plan with effort estimates and risk assessment.' },
    { title: 'Performance profiler', prompt: 'Profile the application for performance bottlenecks. Identify slow queries, memory leaks, and CPU-intensive operations.' },
    { title: 'Migration script writer', prompt: 'Write database migration scripts to safely move from the current schema to the new design. Include rollback procedures.' },
    { title: 'Dependency updater', prompt: 'Audit all project dependencies for outdated versions and security vulnerabilities. Create a safe update plan.' },
    { title: 'Error handling review', prompt: 'Review error handling patterns across the codebase. Identify unhandled exceptions and suggest improvements.' },
    { title: 'Code documentation', prompt: 'Add JSDoc/TSDoc comments to all public functions and classes in the core module. Include parameter descriptions and examples.' },
  ],
  // DevOps & Infrastructure
  [
    { title: 'CI/CD pipeline setup', prompt: 'Design a CI/CD pipeline with build, test, security scan, and deployment stages. Include rollback mechanisms.' },
    { title: 'Kubernetes config', prompt: 'Generate Kubernetes deployment manifests including pods, services, ingress, and HPA configurations for our application.' },
    { title: 'Terraform module', prompt: 'Write Terraform modules to provision our cloud infrastructure including VPC, compute, database, and monitoring resources.' },
    { title: 'Docker optimization', prompt: 'Optimize our Dockerfile for smaller image size, faster builds, and improved security. Use multi-stage builds.' },
    { title: 'Monitoring dashboard', prompt: 'Set up a monitoring dashboard with alerts for CPU, memory, disk, error rates, and response time across all services.' },
    { title: 'Incident runbook', prompt: 'Create incident response runbooks for our top 10 most common production issues. Include diagnosis steps and remediation.' },
    { title: 'Cost optimization', prompt: 'Analyze our cloud spending and identify opportunities to reduce costs without impacting performance or reliability.' },
    { title: 'Disaster recovery plan', prompt: 'Design a disaster recovery plan including RPO/RTO targets, backup strategies, and failover procedures.' },
    { title: 'Load testing script', prompt: 'Create load testing scripts to simulate 10,000 concurrent users. Test API endpoints, database queries, and WebSocket connections.' },
    { title: 'Log aggregation setup', prompt: 'Set up centralized log aggregation with structured logging, search capabilities, and automated alerting on error patterns.' },
  ],
  // Security & Compliance
  [
    { title: 'Vulnerability scanner', prompt: 'Run a comprehensive security scan on our application. Check for OWASP Top 10 vulnerabilities and provide remediation steps.' },
    { title: 'SOC 2 audit prep', prompt: 'Prepare documentation and evidence for SOC 2 Type II audit. Identify gaps in current controls and suggest remediations.' },
    { title: 'Access review', prompt: 'Conduct a user access review across all systems. Identify over-privileged accounts and dormant access that should be revoked.' },
    { title: 'Penetration test plan', prompt: 'Create a penetration testing plan covering web application, API, network, and social engineering attack vectors.' },
    { title: 'GDPR compliance check', prompt: 'Audit our data processing activities for GDPR compliance. Check consent management, data retention, and right-to-erasure.' },
    { title: 'Security policy writer', prompt: 'Draft an information security policy covering access control, data classification, incident response, and acceptable use.' },
    { title: 'API security review', prompt: 'Review API security including authentication, authorization, rate limiting, input validation, and data exposure risks.' },
    { title: 'Encryption audit', prompt: 'Audit encryption practices for data at rest and in transit. Check certificate management and key rotation policies.' },
    { title: 'Threat model builder', prompt: 'Build a threat model for our application using STRIDE methodology. Identify threats, vulnerabilities, and mitigations.' },
    { title: 'Compliance dashboard', prompt: 'Create a compliance status dashboard tracking all regulatory requirements, control effectiveness, and remediation progress.' },
  ],
  // Product & Design
  [
    { title: 'PRD generator', prompt: 'Generate a Product Requirements Document for the new feature. Include user stories, acceptance criteria, and success metrics.' },
    { title: 'User journey mapper', prompt: 'Map the complete user journey from signup to first value moment. Identify friction points and drop-off areas.' },
    { title: 'Feature prioritization', prompt: 'Score and prioritize the feature backlog using RICE framework. Include reach, impact, confidence, and effort estimates.' },
    { title: 'Competitor analysis', prompt: 'Analyze the top 5 competitors product features, pricing, and positioning. Identify opportunities for differentiation.' },
    { title: 'Wireframe reviewer', prompt: 'Review the wireframes for usability issues, accessibility compliance, and consistency with our design system.' },
    { title: 'Release notes writer', prompt: 'Write user-friendly release notes for the latest version. Group changes by category and highlight key improvements.' },
    { title: 'User research planner', prompt: 'Plan a user research study to validate our hypothesis. Include methodology, participant criteria, and interview guide.' },
    { title: 'Onboarding flow design', prompt: 'Design an onboarding flow that gets users to their first "aha moment" in under 5 minutes. Include tooltips and guides.' },
    { title: 'Accessibility audit', prompt: 'Audit the application for WCAG 2.1 AA compliance. Check color contrast, keyboard navigation, screen reader support.' },
    { title: 'Design system docs', prompt: 'Document our design system components including usage guidelines, props, variants, and code examples.' },
  ],
  // Marketing & Content
  [
    { title: 'Blog post generator', prompt: 'Write a technical blog post about our latest feature release. Include use cases, implementation details, and customer quotes.' },
    { title: 'SEO content planner', prompt: 'Create an SEO content plan targeting our top 20 keywords. Include content briefs, word count targets, and internal linking.' },
    { title: 'Email campaign builder', prompt: 'Design a nurture email campaign for trial users. Create 7 emails over 14 days focusing on feature adoption.' },
    { title: 'Social media calendar', prompt: 'Generate a 30-day social media content calendar. Include post copy, hashtags, and optimal posting times for each platform.' },
    { title: 'Landing page copy', prompt: 'Write conversion-optimized copy for our product landing page. Include headline, subheadline, benefits, and CTAs.' },
    { title: 'Case study writer', prompt: 'Write a customer case study highlighting the problem, solution, and measurable results. Include direct quotes.' },
    { title: 'Webinar script', prompt: 'Create a 45-minute webinar script on industry trends. Include speaker notes, slide suggestions, and Q&A preparation.' },
    { title: 'Newsletter composer', prompt: 'Compose this months newsletter including product updates, industry news, tips & tricks, and upcoming events.' },
    { title: 'Ad copy generator', prompt: 'Generate ad copy variations for Google Ads and LinkedIn Ads. Create 5 headlines and 3 descriptions for each platform.' },
    { title: 'Content repurposer', prompt: 'Repurpose our latest whitepaper into 10 social posts, 3 blog snippets, an email summary, and an infographic outline.' },
  ],
  // Customer Support
  [
    { title: 'Ticket classifier', prompt: 'Classify incoming support tickets by priority, category, and suggested assignment. Flag urgent issues for immediate attention.' },
    { title: 'Knowledge base builder', prompt: 'Create knowledge base articles for our top 20 most frequently asked questions. Include step-by-step instructions.' },
    { title: 'Response template maker', prompt: 'Create email response templates for common support scenarios including billing, technical issues, and feature requests.' },
    { title: 'Escalation handler', prompt: 'Draft an escalation response for a frustrated enterprise customer. Acknowledge the issue, provide timeline, and offer compensation.' },
    { title: 'CSAT analysis', prompt: 'Analyze customer satisfaction survey results from the last quarter. Identify trends, top complaints, and improvement areas.' },
    { title: 'Bug report formatter', prompt: 'Take the customer-reported issue and format it as a detailed bug report with reproduction steps, expected vs actual behavior.' },
    { title: 'SLA monitor', prompt: 'Review SLA compliance for the past month. Identify breaches, root causes, and recommend process improvements.' },
    { title: 'Onboarding guide', prompt: 'Create a customer onboarding guide with setup steps, best practices, and links to relevant documentation.' },
    { title: 'Churn risk detector', prompt: 'Analyze customer health scores and usage patterns to identify accounts at risk of churning. Suggest retention actions.' },
    { title: 'Feedback synthesizer', prompt: 'Synthesize all customer feedback from the past month into themes. Prioritize by frequency and business impact.' },
  ],
  // Finance & Operations
  [
    { title: 'Budget planner', prompt: 'Create a quarterly budget plan for the engineering department. Include headcount, tools, infrastructure, and contingency.' },
    { title: 'Invoice processor', prompt: 'Process the batch of vendor invoices. Validate against POs, check for duplicates, and flag discrepancies for review.' },
    { title: 'Revenue forecaster', prompt: 'Build a revenue forecast model for the next 4 quarters based on current ARR, expansion, churn, and new business pipeline.' },
    { title: 'Expense analyzer', prompt: 'Analyze company expenses by category and department. Identify trends, anomalies, and cost-saving opportunities.' },
    { title: 'Contract reviewer', prompt: 'Review the vendor contract for unfavorable terms, auto-renewal clauses, and liability issues. Suggest negotiation points.' },
    { title: 'OKR tracker', prompt: 'Set up OKR tracking for the quarter. Define objectives, key results, and progress milestones for each team.' },
    { title: 'Process optimizer', prompt: 'Map and analyze our order fulfillment process. Identify bottlenecks, waste, and automation opportunities.' },
    { title: 'Vendor comparison', prompt: 'Compare the top 3 vendor proposals on price, features, support, and integration capabilities. Provide a recommendation.' },
    { title: 'Cash flow analyzer', prompt: 'Analyze cash flow patterns over the last 12 months. Forecast upcoming 3 months and flag potential shortfall periods.' },
    { title: 'Compliance reporter', prompt: 'Generate the monthly financial compliance report including audit trail, policy adherence, and exception documentation.' },
  ],
  // AI & Machine Learning
  [
    { title: 'Model evaluator', prompt: 'Evaluate the trained model performance using precision, recall, F1-score, and AUC-ROC. Compare against baseline.' },
    { title: 'Feature engineering', prompt: 'Suggest feature engineering approaches for our prediction model. Include numerical, categorical, and temporal features.' },
    { title: 'Prompt optimizer', prompt: 'Optimize this LLM prompt for better accuracy and consistency. Test with edge cases and measure improvement.' },
    { title: 'Training data curator', prompt: 'Review and curate the training dataset. Remove duplicates, fix labels, handle class imbalance, and ensure quality.' },
    { title: 'ML pipeline designer', prompt: 'Design an end-to-end ML pipeline from data ingestion to model serving. Include monitoring and retraining triggers.' },
    { title: 'Bias auditor', prompt: 'Audit the model for bias across protected attributes. Measure fairness metrics and suggest debiasing strategies.' },
    { title: 'Hyperparameter tuner', prompt: 'Set up hyperparameter tuning for the model using Bayesian optimization. Define search space and evaluation criteria.' },
    { title: 'RAG system builder', prompt: 'Design a Retrieval-Augmented Generation system for our knowledge base. Include chunking strategy and retrieval optimization.' },
    { title: 'Model card writer', prompt: 'Create a model card documenting the models purpose, training data, performance metrics, limitations, and ethical considerations.' },
    { title: 'Experiment tracker', prompt: 'Set up experiment tracking for our ML projects. Log parameters, metrics, artifacts, and enable comparison across runs.' },
  ],
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rearch';
  console.log('Connecting to', uri);
  await mongoose.connect(uri);
  console.log('Connected.');

  // Clean existing
  await Prompt.deleteMany({});
  await Category.deleteMany({});
  console.log('Cleared existing suggested prompts and categories.');

  const db = mongoose.connection.db;
  const bucket = new GridFSBucket(db, { bucketName: 'attachments' });

  for (let ci = 0; ci < categories.length; ci++) {
    const catData = categories[ci];
    const cat = await Category.create({ ...catData, order: ci });
    console.log(`Created category: ${cat.name}`);

    const prompts = promptsByCategory[ci];
    for (let pi = 0; pi < prompts.length; pi++) {
      const pData = prompts[pi];
      const [r, g, b] = IMAGE_COLORS[(ci + pi) % IMAGE_COLORS.length];
      const imgBuf = createPlaceholderImage(325, 120, r, g, b);

      // Upload image to GridFS
      const imageFileId = await new Promise((resolve, reject) => {
        const stream = bucket.openUploadStream(`prompt-${catData.slug}-${pi}.bmp`, {
          contentType: 'image/bmp',
          metadata: { public: true, originalName: `prompt-${catData.slug}-${pi}.bmp`, uploadDate: new Date() },
        });
        stream.end(imgBuf);
        stream.on('finish', () => resolve(stream.id));
        stream.on('error', reject);
      });

      await Prompt.create({
        title: pData.title,
        prompt: pData.prompt,
        icon: ICONS[(ci + pi) % ICONS.length],
        iconColor: COLORS[ci % COLORS.length],
        imageFileId,
        category: cat._id,
        order: pi,
      });
      process.stdout.write('.');
    }
    console.log(` ${prompts.length} prompts created.`);
  }

  console.log('\nDone! Created 10 categories with 10 prompts each (100 total).');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
