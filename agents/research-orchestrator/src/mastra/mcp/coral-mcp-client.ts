import { MCPClient } from '@mastra/mcp'

const coralUrl = process.env.CORAL_CONNECTION_URL

export const coralMcpClient = coralUrl
	? new MCPClient({
			id: 'coral-mcp-client',
			timeout: 1_200_000,
			servers: {
				coral: { url: new URL(coralUrl) }
			}
		})
	: null

export async function getCoralTools() {
	if (!coralMcpClient) return {}
	return await coralMcpClient.listTools()
}
