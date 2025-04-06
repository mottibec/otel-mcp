
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchComponents } from "./github.js";
import fs from 'fs/promises';
import path from 'path';
import { ComponentType } from "./types.js";
import logger from "../logger.js";


// Resource file paths
const RESOURCES_DIR = './resources';
const RECEIVERS_FILE = path.join(RESOURCES_DIR, 'receivers.json');
const PROCESSORS_FILE = path.join(RESOURCES_DIR, 'processors.json');
const EXPORTERS_FILE = path.join(RESOURCES_DIR, 'exporters.json');
const SCHEMAS_DIR = path.join(RESOURCES_DIR, 'schemas');

// Function to update resource files
const updateResourceFiles = async () => {
    try {
        // Ensure resources directory exists
        await fs.mkdir(RESOURCES_DIR, { recursive: true });
        await fs.mkdir(SCHEMAS_DIR, { recursive: true });

        // Create schema directories
        await fs.mkdir(path.join(SCHEMAS_DIR, 'receivers'), { recursive: true });
        await fs.mkdir(path.join(SCHEMAS_DIR, 'processors'), { recursive: true });
        await fs.mkdir(path.join(SCHEMAS_DIR, 'exporters'), { recursive: true });

        // Fetch and save receivers
        const receivers = await fetchComponents('receiver');
        await fs.writeFile(RECEIVERS_FILE, JSON.stringify(receivers, null, 2));
        await saveComponentSchemas('receiver', receivers);

        // Fetch and save processors
        const processors = await fetchComponents('processor');
        await fs.writeFile(PROCESSORS_FILE, JSON.stringify(processors, null, 2));
        await saveComponentSchemas('processor', processors);

        // Fetch and save exporters
        const exporters = await fetchComponents('exporter');
        await fs.writeFile(EXPORTERS_FILE, JSON.stringify(exporters, null, 2));
        await saveComponentSchemas('exporter', exporters);

        return {
            receivers: receivers.length,
            processors: processors.length,
            exporters: exporters.length
        };
    } catch (error) {
        throw new Error(`Failed to update resource files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Function to save component schemas
const saveComponentSchemas = async (type: ComponentType, components: any[]) => {
    const typeDir = path.join(SCHEMAS_DIR, `${type}s`);

    for (const component of components) {
        if (component.configSchema) {
            const schemaPath = path.join(typeDir, `${component.name}.json`);
            await fs.writeFile(schemaPath, JSON.stringify(component.configSchema, null, 2));
        }
    }
}

// Function to load component schema
const loadComponentSchema = async (type: ComponentType, name: string) => {
    try {
        const schemaPath = path.join(SCHEMAS_DIR, `${type}s`, `${name}.json`);
        const schemaContent = await fs.readFile(schemaPath, 'utf-8');
        return JSON.parse(schemaContent);
    } catch (error) {
        logger.warn(`Failed to load schema for ${type} ${name}`, { error });
        return undefined;
    }
}



const registerTools = (server: McpServer) => {
    // Tool to update resources
    server.tool(
        "update-resources",
        "Update open telementry collector contrib local resource files with latest component (receiver, processor, exporter) information (config schema, readme, etc)",
        {},
        async () => {
            logger.info('Updating resource files');
            try {
                const stats = await updateResourceFiles();
                logger.info('Successfully updated resource files', stats);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Successfully updated resource files:\n` +
                                `- Receivers: ${stats.receivers}\n` +
                                `- Processors: ${stats.processors}\n` +
                                `- Exporters: ${stats.exporters}`,
                        },
                    ],
                };
            } catch (error) {
                logger.error('Error updating resource files', { error });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error updating resource files: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        },
                    ],
                };
            }
        },
    );

    // Resource to get receivers
    server.resource("receivers", "receivers://receivers", { description: "Open Telemetry Collector Contrib Receivers" }, async () => {
        try {
            const data = await fs.readFile(RECEIVERS_FILE, 'utf8');
            const receivers = JSON.parse(data);
            return {
                contents: receivers.map((rec: any) => ({
                    uri: `receiver/${rec.name}`,
                    text: JSON.stringify({
                        name: rec.name,
                        description: rec.description,
                        stability: rec.stability
                    }, null, 2),
                    mimeType: "application/json"
                }))
            };
        } catch (error) {
            logger.error('Error reading receivers resource', { error });
            throw error;
        }
    });

    // Resource to get processors
    server.resource("processors", "processors://processors", { description: "Open Telemetry Collector Contrib Processors" }, async () => {
        try {
            const data = await fs.readFile(PROCESSORS_FILE, 'utf8');
            const processors = JSON.parse(data);
            return {
                contents: processors.map((proc: any) => ({
                    uri: `processor/${proc.name}`,
                    text: JSON.stringify({
                        name: proc.name,
                        description: proc.description,
                        stability: proc.stability
                    }, null, 2),
                    mimeType: "application/json"
                }))
            };
        } catch (error) {
            logger.error('Error reading processors resource', { error });
            throw error;
        }
    });

    // Resource to get exporters
    server.resource("exporters", "exporters://exporters", { description: "Open Telemetry Collector Contrib Exporters" }, async () => {
        try {
            const data = await fs.readFile(EXPORTERS_FILE, 'utf8');
            const exporters = JSON.parse(data);
            return {
                contents: exporters.map((exp: any) => ({
                    uri: `exporter/${exp.name}`,
                    text: JSON.stringify({
                        name: exp.name,
                        description: exp.description,
                        stability: exp.stability
                    }, null, 2),
                    mimeType: "application/json"
                }))
            };
        } catch (error) {
            logger.error('Error reading exporters resource', { error });
            throw error;
        }
    });

    // Resource to get component schema for a specific component
    server.resource("component-schemas",
        new ResourceTemplate("component://{type}/{name}", { list: undefined }),
        { description: "Open Telemetry Collector Contrib Component Schemas (receiver, processor, exporter)" },
        async (uri, { type, name }) => {
            logger.info('component-schemas', { uri, type, name });

            if (Array.isArray(type)) {
                type = type[0]

            }
            if (Array.isArray(name)) {
                name = name[0]
            }

            try {
                if (type && name) {
                    // Convert plural to singular for the component type
                    const componentType = type.endsWith('s') ?
                        type.slice(0, -1) as ComponentType :
                        type as ComponentType;

                    // Load specific component schema
                    const schema = await loadComponentSchema(componentType, name);
                    if (!schema) {
                        throw new Error(`Schema not found for ${type} ${name}`);
                    }

                    return {
                        contents: [{
                            uri: `${type}/${name}`,
                            text: JSON.stringify(schema, null, 2),
                            mimeType: "application/json"
                        }]
                    };
                }

                // If no specific path provided, list all available schemas
                const types = ['receivers', 'processors', 'exporters'];
                const allSchemas = [];

                for (const type of types) {
                    const typeDir = path.join(SCHEMAS_DIR, type);
                    try {
                        const files = await fs.readdir(typeDir);
                        for (const file of files) {
                            if (file.endsWith('.json')) {
                                const componentName = path.basename(file, '.json');
                                const schema = await fs.readFile(path.join(typeDir, file), 'utf8');
                                allSchemas.push({
                                    uri: `${type}/${componentName}`,
                                    text: schema,
                                    mimeType: "application/json"
                                });
                            }
                        }
                    } catch (error) {
                        logger.warn(`Error reading schemas from ${type} directory`, { error });
                    }
                }

                return {
                    contents: allSchemas
                };
            } catch (error) {
                logger.error('Error reading component schemas resource', { error });
                throw error;
            }
        });
}

export default registerTools;