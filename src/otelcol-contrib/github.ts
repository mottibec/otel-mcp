import { Octokit } from "@octokit/rest";
import { Component, ComponentConfig, ConfigSchema, ComponentType } from './types.js';
import { parseConfigSchema } from './parser/config.js';
import { extractStability, extractDescription } from './parser/readme.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const REPO_OWNER = 'open-telemetry';
const REPO_NAME = 'opentelemetry-collector-contrib';

// Get GitHub token from environment variable
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Create Octokit instance with auth token if available
const octokit = new Octokit(GITHUB_TOKEN ? {
    auth: GITHUB_TOKEN,
} : {});

// Add warning if no token is provided
if (!GITHUB_TOKEN) {
    console.warn('No GITHUB_TOKEN environment variable found. API rate limits will be restricted.');
}

async function fetchConfigSchema(type: ComponentType, name: string): Promise<ConfigSchema | undefined> {
    try {
        const { data: configData } = await octokit.repos.getContent({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: `${type}/${name}/config.go`,
        });

        if (!('content' in configData)) {
            return undefined;
        }

        const content = Buffer.from(configData.content, 'base64').toString('utf-8');
        return parseConfigSchema(content);
    } catch (error) {
        console.warn(`Failed to fetch config schema for ${type} ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return undefined;
    }
}

export async function fetchComponents(type: ComponentType): Promise<Component[]> {
    console.log(`Fetching ${type}s from GitHub`);
    try {
        const { data: contents } = await octokit.repos.getContent({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: type,
        });

        if (!Array.isArray(contents)) {
            throw new Error(`Unexpected response format for ${type}s`);
        }

        const components: Component[] = [];

        for (const item of contents) {
            if (item.type === 'dir') {
                try {
                    const { data: readmeData } = await octokit.repos.getContent({
                        owner: REPO_OWNER,
                        repo: REPO_NAME,
                        path: `${type}/${item.name}/README.md`,
                    });

                    if ('content' in readmeData) {
                        const content = Buffer.from(readmeData.content, 'base64').toString('utf-8');
                        const configSchema = await fetchConfigSchema(type, item.name);

                        components.push({
                            name: item.name,
                            description: extractDescription(content),
                            stability: extractStability(content),
                            readmeUrl: readmeData.html_url || '',
                            configSchema
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to fetch README for ${item.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        }

        return components;
    } catch (error) {
        throw new Error(`Failed to fetch ${type}s: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function fetchComponentConfig(type: ComponentType, name: string): Promise<ComponentConfig> {
    console.log(`Fetching ${type} ${name} config from GitHub`);
    try {
        const { data: readmeData } = await octokit.repos.getContent({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            path: `${type}/${name}/README.md`,
        });

        if (!('content' in readmeData)) {
            throw new Error('Failed to fetch README content');
        }

        const content = Buffer.from(readmeData.content, 'base64').toString('utf-8');

        // Extract configuration section
        const configMatch = content.match(/## Configuration\n\n([\s\S]*?)(?=\n\n##|$)/);
        const configuration = configMatch ? configMatch[1].trim() : 'No configuration documentation available';

        // Fetch config schema
        const configSchema = await fetchConfigSchema(type, name);

        return {
            name,
            description: extractDescription(content),
            stability: extractStability(content),
            configuration,
            configSchema
        };
    } catch (error) {
        throw new Error(`Failed to fetch ${type} ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}