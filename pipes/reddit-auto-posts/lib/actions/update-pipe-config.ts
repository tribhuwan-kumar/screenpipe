"use server";
import { promises as fs } from 'fs';
import path from 'path';

export default async function updatePipeConfig(
  redditSettings: any, 
) {

  if (!redditSettings) {
    throw new Error("Reddit settings not found");
  }

  const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
  const pipeConfigPath = path.join(
    screenpipeDir,
    "pipes",
    "reddit-auto-posts",
    "pipe.json"
  );

  const configData = {
    crons: [
      {
        path: "/api/pipeline",
        schedule: `0 */${redditSettings?.interval / 60} * * * *`,
      },
    ],
  };

  try {
    await fs.writeFile(pipeConfigPath, JSON.stringify(configData, null, 2));
    console.log("Reddit settings saved to", pipeConfigPath);
  } catch (error) {
    console.error("Failed to save Reddit settings:", error);
    throw error;
  }
}

