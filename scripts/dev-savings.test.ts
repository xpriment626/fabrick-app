import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAppEnv, parseLauncherArgs } from './dev-savings';

test('parseLauncherArgs enables bypass mode only when requested', () => {
	assert.equal(parseLauncherArgs([]).bypass, false);
	assert.equal(parseLauncherArgs(['--bypass']).bypass, true);
});

test('buildAppEnv binds Fabrick to Savings MCP and disables bypass by default', () => {
	const env = buildAppEnv(
		{
			SAVINGS_MCP_URL: 'http://old.example/mcp',
			DEV_AUTH_PRIVY_DID: '*'
		},
		{
			bypass: false,
			mcpUrl: 'http://127.0.0.1:8788/mcp'
		}
	);

	assert.equal(env.SAVINGS_MCP_URL, 'http://127.0.0.1:8788/mcp');
	assert.equal(env.DEV_AUTH_PRIVY_DID, '');
});

test('buildAppEnv enables dev bypass for the bypass startup script', () => {
	const env = buildAppEnv(
		{},
		{
			bypass: true,
			mcpUrl: 'http://127.0.0.1:8788/mcp'
		}
	);

	assert.equal(env.SAVINGS_MCP_URL, 'http://127.0.0.1:8788/mcp');
	assert.equal(env.DEV_AUTH_PRIVY_DID, '*');
});
