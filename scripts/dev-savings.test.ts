import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildAppEnv,
	buildCoralEnv,
	coralNpxCommand,
	parseLauncherArgs,
	readEnvFile,
	sanitizeCoralPath
} from './dev-savings';

test('parseLauncherArgs enables bypass mode only when requested', () => {
	assert.equal(parseLauncherArgs([]).bypass, false);
	assert.equal(parseLauncherArgs(['--bypass']).bypass, true);
});

test('parseLauncherArgs keeps detached children by default and supports attached test mode', () => {
	assert.equal(parseLauncherArgs([], {}).detachedChildren, true);
	assert.equal(parseLauncherArgs([], { FABRICK_DEV_ATTACHED: '1' }).detachedChildren, false);
});

test('parseLauncherArgs starts Coral by default and supports local Coral overrides', () => {
	const config = parseLauncherArgs([
		'--coral-api-url=http://127.0.0.1:6666',
		'--coral-auth-key=local-dev',
		'--coral-config=/tmp/fabrick-coral.toml',
		'--no-start-coral',
		'--coral-prebuilt'
	]);

	assert.equal(config.coralApiUrl, 'http://127.0.0.1:6666');
	assert.equal(config.coralAuthKey, 'local-dev');
	assert.equal(config.coralConfigPath, '/tmp/fabrick-coral.toml');
	assert.equal(config.startCoral, false);
	assert.equal(config.coralFromSource, false);
});

test('buildAppEnv binds Fabrick to Savings MCP and disables bypass by default', () => {
	const env = buildAppEnv(
		{
			CORAL_API_KEY: 'cloud-secret',
			CORAL_CLOUD_API_URL: 'https://api.coralcloud.ai',
			SAVINGS_MCP_URL: 'http://old.example/mcp',
			DEV_AUTH_PRIVY_DID: '*'
		},
		{
			bypass: false,
			coralApiUrl: 'http://127.0.0.1:5555',
			coralAuthKey: 'dev',
			mcpUrl: 'http://127.0.0.1:8788/mcp'
		}
	);

	assert.equal(env.SAVINGS_MCP_URL, 'http://127.0.0.1:8788/mcp');
	assert.equal(env.CORAL_CLOUD_API_URL, 'http://127.0.0.1:5555');
	assert.equal(env.CORAL_API_KEY, 'dev');
	assert.equal(env.DEV_AUTH_PRIVY_DID, '');
});

test('buildAppEnv enables dev bypass for the bypass startup script', () => {
	const env = buildAppEnv(
		{},
		{
			bypass: true,
			coralApiUrl: 'http://127.0.0.1:5555',
			coralAuthKey: 'dev',
			mcpUrl: 'http://127.0.0.1:8788/mcp'
		}
	);

	assert.equal(env.SAVINGS_MCP_URL, 'http://127.0.0.1:8788/mcp');
	assert.equal(env.DEV_AUTH_PRIVY_DID, '*');
});

test('buildCoralEnv passes the config file and keeps the Cloud key inside the Coral server env', () => {
	const env = buildCoralEnv(
		{
			CORAL_API_KEY: 'cloud-secret',
			PATH: '/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/usr/local/bin',
			npm_config_prefix: '/bad/prefix'
		},
		{
			coralConfigPath: '/repo/agents/fabrick-coral-local.toml'
		}
	);

	assert.equal(env.CONFIG_FILE_PATH, '/repo/agents/fabrick-coral-local.toml');
	assert.equal(env['config.override.cloud.apiKey'], 'cloud-secret');
	assert.equal(env.PATH, '/usr/local/bin');
	assert.equal(env.npm_config_prefix, undefined);
});

test('sanitizeCoralPath leaves normal paths alone and strips the Codex bundled Node path', () => {
	assert.equal(sanitizeCoralPath('/usr/local/bin:/usr/bin'), '/usr/local/bin:/usr/bin');
	assert.equal(
		sanitizeCoralPath(
			'/tmp/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/usr/local/bin'
		),
		'/usr/local/bin'
	);
});

test('coralNpxCommand resolves to an npx executable', () => {
	assert.match(coralNpxCommand(), /npx$/);
});

test('readEnvFile loads quoted env values without overriding process env', () => {
	const env = readEnvFile(
		[
			'CORAL_API_KEY=from-file',
			'CORAL_LOCAL_API_KEY=dev',
			'QUOTED="quoted-value"',
			'# ignored'
		].join('\n'),
		{ CORAL_API_KEY: 'from-process' }
	);

	assert.equal(env.CORAL_API_KEY, 'from-process');
	assert.equal(env.CORAL_LOCAL_API_KEY, 'dev');
	assert.equal(env.QUOTED, 'quoted-value');
});
