import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Octokit } from '@octokit/rest';
import logger from '../logger.js';

export interface SemanticConvention {
  id: string;
  type: string;
  name: string;
  content: string;
}

export interface SemanticConventions {
  version: string;
  namespace: string;
  conventions: SemanticConvention[];
}

const octokit = new Octokit();

export async function fetchNamespaceSemanticConventions(version: string = 'main', namespace: string): Promise<SemanticConventions> {
  try {
    const response = await octokit.repos.getContent({
      owner: 'open-telemetry',
      repo: 'semantic-conventions',
      path: `docs/${namespace}`,
      ref: version,
    });

    if (!Array.isArray(response.data)) {
      throw new Error('Expected directory content');
    }

    const conventions: SemanticConvention[] = [];

    // Process each markdown file
    for (const item of response.data) {
      if (item.type === 'file' && item.name.endsWith('.md')) {
        const fileContent = await octokit.repos.getContent({
          owner: 'open-telemetry',
          repo: 'semantic-conventions',
          path: item.path,
          ref: version,
        });

        if ('content' in fileContent.data) {
          const content = Buffer.from(fileContent.data.content, 'base64').toString('utf-8');
          conventions.push({
            id: item.name,
            type: item.type,
            name: item.name,
            content: content
          });
        }
      }
    }

    return {
      version,
      namespace,
      conventions,
    };
  } catch (error) {
    console.error('Error fetching semantic conventions:', error);
    throw error;
  }
}


export const registerSemanticConventionsTools = (server: McpServer) => {

  // Resource to get semantic conventions for a specific namespace and version
  server.resource("semantic-conventions",
    new ResourceTemplate("semantic-conventions://{namespace}/{version}", { list: undefined }),
    { description: "Open Telemetry Semantic Conventions for a specific namespace (e.g. http, Database, etc.) and an optional version (main for latest, v1.0.0 for specific version)" },
    async (uri, { namespace, version }) => {
      logger.info('semantic-conventions', { uri, namespace, version });

      if (Array.isArray(namespace)) {
        namespace = namespace[0]

      }
      if (Array.isArray(version)) {
        version = version[0]
      }
      if (!version) {
        version = 'main'
      }

      try {
        if (namespace && version) {
          // Load specific component schema
          const schema = await fetchNamespaceSemanticConventions(version, namespace);
          if (!schema) {
            throw new Error(`Schema not found for ${namespace} ${version}`);
          }

          return {
            contents: schema.conventions.map(convention => ({
              uri: `${namespace}/${version}/${convention.id}`,
              text: convention.content,
              mimeType: "text/markdown"
            }))
          };
        }
        return {
          contents: []
        };
      } catch (error) {
        logger.error('Error reading semantic conventions resource', { error });
        throw error;
      }
    });
}