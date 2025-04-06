import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import logger from "./logger.js";
import registerTools from "./otelcol-contrib/index.js";
import { registerSemanticConventionsTools } from "./semantic-conventions/index.js";



// Create Express app
const app = express();

// Create server instance
const server = new McpServer({
    name: "otelcol-config",
    version: "1.0.0",
});

registerTools(server);
registerSemanticConventionsTools(server);

// Initialize resources on startup
if (!process.env.GITHUB_TOKEN) {
    logger.warn('No GITHUB_TOKEN environment variable found. GitHub API rate limits will be restricted.');
    logger.warn('To increase rate limits, set the GITHUB_TOKEN environment variable with a GitHub Personal Access Token.');
    logger.warn('You can create a token at: https://github.com/settings/tokens');
}

// to support multiple simultaneous connections we have a lookup object from
// sessionId to transport
const transports: { [sessionId: string]: SSEServerTransport } = {};

app.get("/sse", async (_: Request, res: Response) => {
    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;
    logger.info('New SSE connection established', { sessionId: transport.sessionId });

    res.on("close", () => {
        logger.info('SSE connection closed', { sessionId: transport.sessionId });
        delete transports[transport.sessionId];
    });

    await server.connect(transport);
});

app.post("/messages", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    logger.debug('Received message', { sessionId, body: req.body });

    const transport = transports[sessionId];
    if (transport) {
        try {
            await transport.handlePostMessage(req, res);
            logger.debug('Successfully handled message', { sessionId });
        } catch (error) {
            logger.error('Error handling message', {
                sessionId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            res.status(500).send('Error handling message');
        }
    } else {
        logger.warn('No transport found for sessionId', { sessionId });
        res.status(400).send('No transport found for sessionId');
    }
});

const port = process.env.PORT || 3001;

app.listen(port, () => {
    logger.info('Server started', { port });
});