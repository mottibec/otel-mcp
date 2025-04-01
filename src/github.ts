import { Octokit } from "@octokit/rest";
import { Component, ComponentConfig, GitHubContentResponse, ConfigSchema, ConfigField } from './types.js';
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

function extractStability(content: string): string {
    // First try to find stability in the autogenerated status section
    const statusSectionMatch = content.match(/\| Status\s*\|\s*\|\s*\n\|-+\|-+\|\s*\n\|\s*Stability\s*\|\s*\[([^\]]+)\][^\n]*\|/);
    if (statusSectionMatch) {
        return statusSectionMatch[1].trim();
    }

    // Fallback to the old format
    const stabilityMatch = content.match(/Stability:\s*([^\n]+)/);
    if (stabilityMatch) {
        return stabilityMatch[1].trim();
    }

    return 'Unknown';
}

function extractDescription(content: string): string {
    // Skip the autogenerated section if it exists
    const contentWithoutStatus = content.replace(/<!-- status autogenerated section -->[\s\S]*?<!-- end autogenerated section -->\s*/g, '');

    // Get the first non-empty paragraph after removing the status section
    const descriptionMatch = contentWithoutStatus.match(/^#[^\n]*\n+([^\n]+)/);
    if (descriptionMatch) {
        return descriptionMatch[1].trim();
    }

    return 'No description available';
}

function parseConfigSchema(content: string): ConfigSchema | undefined {
    try {
        // Extract package name
        const packageMatch = content.match(/package\s+(\w+)/);
        const packageName = packageMatch ? packageMatch[1] : '';

        // Extract imports
        const importsMatch = content.match(/import\s*\(([\s\S]*?)\)/);
        const imports = importsMatch ? importsMatch[1]
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('//'))
            .map(line => line.replace(/^"(.*)"$/, '$1'))
            : [];

        // Find the main Config struct
        const configMatch = content.match(/type\s+Config\s+struct\s*{([\s\S]*?)}/);
        if (!configMatch) return undefined;

        const fields = parseStructFields(configMatch[1]);

        return {
            fields,
            imports,
            packageName
        };
    } catch (error) {
        console.warn('Failed to parse config schema:', error);
        return undefined;
    }
}

function parseStructFields(structContent: string): ConfigField[] {
    const fields: ConfigField[] = [];
    const lines = structContent.split('\n');
    let currentComment = '';

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Skip empty lines
        if (!trimmedLine) continue;

        // Collect comments
        if (trimmedLine.startsWith('//')) {
            currentComment = (currentComment + ' ' + trimmedLine.substring(2).trim()).trim();
            continue;
        }

        // Parse field
        const fieldMatch = trimmedLine.match(/^(\w+)\s+([^`]+)\s*`?(?:mapstructure:"([^"]*)")?`?/);
        if (fieldMatch) {
            const [_, name, type, mapstructureTag] = fieldMatch;

            // Check if this is a nested struct
            const nestedStructMatch = type.match(/struct\s*{([\s\S]*?)}/);
            const nestedSchema = nestedStructMatch ? {
                fields: parseStructFields(nestedStructMatch[1]),
                imports: [],
                packageName: ''
            } : undefined;

            fields.push({
                name,
                type: type.trim(),
                description: currentComment,
                required: !mapstructureTag?.includes('omitempty'),
                mapstructureTag,
                nestedSchema
            });
        }

        // Reset comment for next field
        currentComment = '';
    }

    return fields;
}

async function fetchConfigSchema(type: 'receiver' | 'processor' | 'exporter', name: string): Promise<ConfigSchema | undefined> {
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

export async function fetchComponents(type: 'receiver' | 'processor' | 'exporter'): Promise<Component[]> {
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

export async function fetchComponentConfig(type: 'receiver' | 'processor' | 'exporter', name: string): Promise<ComponentConfig> {
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