import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  paths: {
    dataPath: process.env.DATA_PATH || path.join(__dirname, 'data')
  },
  conversationContainerImage: process.env.CONVERSATION_CONTAINER_IMAGE
};

export default config;
