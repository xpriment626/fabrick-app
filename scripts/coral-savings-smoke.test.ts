import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	CORAL_CLOUD_API_URL,
	SAVINGS_SPECIALISTS,
	buildBuiltinCoordinationRequest,
	buildLocalAgentRegistryPaths,
	buildReportSmokeTask,
	buildSessionRequest,
	countMessages,
	findMissingRegistryAgents,
	isTerminalSessionState,
	readEnvFile
} from './coral-savings-smoke';

test('buildSessionRequest creates one prototype-runtime group for all savings specialists', () => {
	const request = buildSessionRequest({
		namespace: 'fabrick-savings-smoke',
		savingsMcpUrl: 'https://savings.example/mcp',
		task: 'Compare USDC opportunities.'
	});

	assert.equal(request.namespaceProvider.type, 'create_if_not_exists');
	assert.equal(request.namespaceProvider.namespaceRequest.name, 'fabrick-savings-smoke');
	assert.deepEqual(
		request.agentGraphRequest.groups,
		[SAVINGS_SPECIALISTS.map((agent) => agent.instanceName)]
	);
	assert.equal(request.agentGraphRequest.agents.length, 6);

	for (const [index, agent] of request.agentGraphRequest.agents.entries()) {
		const specialist = SAVINGS_SPECIALISTS[index];
		assert.equal(agent.id.name, specialist.registryName);
		assert.equal(agent.id.version, specialist.version);
		assert.deepEqual(agent.id.registrySourceId, { type: 'local' });
		assert.equal(agent.provider.type, 'local');
		assert.equal(agent.provider.runtime, 'prototype');
		assert.equal(agent.options.SAVINGS_MCP_URL.value, 'https://savings.example/mcp');
		assert.equal(agent.options.SMOKE_TASK.value, 'Compare USDC opportunities.');
	}
});

test('buildSessionRequest can target a linked Coral registry and provider', () => {
	const request = buildSessionRequest({
		namespace: 'fabrick-savings-smoke',
		savingsMcpUrl: 'https://savings.example/mcp',
		task: 'Compare USDC opportunities.',
		linkedServer: 'fabrick-dev'
	});

	for (const agent of request.agentGraphRequest.agents) {
		assert.deepEqual(agent.id.registrySourceId, {
			type: 'linked',
			linkedServerId: 'fabrick-dev'
		});
		assert.deepEqual(agent.provider, {
			type: 'linked',
			linkedServerName: 'fabrick-dev',
			runtime: 'prototype'
		});
	}
});

test('buildBuiltinCoordinationRequest creates a seed and echo Cloud coordination probe', () => {
	const request = buildBuiltinCoordinationRequest('fabrick-savings-smoke-builtin');

	assert.equal(request.namespaceProvider.namespaceRequest.name, 'fabrick-savings-smoke-builtin');
	assert.deepEqual(request.agentGraphRequest.groups, [['seed', 'echo']]);
	assert.deepEqual(
		request.agentGraphRequest.agents.map((agent) => agent.id.name),
		['seed', 'echo']
	);
	assert.deepEqual(
		request.agentGraphRequest.agents.map((agent) => agent.provider.runtime),
		['function', 'function']
	);
	assert.deepEqual(request.agentGraphRequest.agents[0].options.MENTIONS, {
		type: 'list[string]',
		value: ['echo']
	});
	assert.deepEqual(request.agentGraphRequest.agents[1].options.MENTIONS, {
		type: 'bool',
		value: true
	});
});

test('buildReportSmokeTask frames a fixed Composition Report preview', () => {
	const task = buildReportSmokeTask({
		amountUsd: 1000,
		riskPreference: 'balanced',
		opportunities: [{ id: 'kamino:lend:main-usdc', title: 'USDC Main Market' }],
		allocation: {
			allocation: {
				weights: [
					{
						opportunityId: 'kamino:lend:main-usdc',
						title: 'USDC Main Market',
						weightPct: 100,
						apy: 0.041
					}
				],
				blendedApyPct: 4.1
			}
		}
	});

	assert.match(task, /Composition Report/);
	assert.match(task, /already selected/);
	assert.match(task, /Do not prepare, sign, submit, or mutate/);
	assert.match(task, /USDC Main Market/);
});

test('buildLocalAgentRegistryPaths points at each prototype agent directory', () => {
	const paths = buildLocalAgentRegistryPaths('/repo/fabrick-app');

	assert.deepEqual(paths, [
		'/repo/fabrick-app/agents/savings-specialists/opportunity-data-interpreter',
		'/repo/fabrick-app/agents/savings-specialists/rate-quality-specialist',
		'/repo/fabrick-app/agents/savings-specialists/exit-liquidity-specialist',
		'/repo/fabrick-app/agents/savings-specialists/capacity-concentration-specialist',
		'/repo/fabrick-app/agents/savings-specialists/strategy-exposure-specialist',
		'/repo/fabrick-app/agents/savings-specialists/account-strategy-narrator'
	]);
});

test('findMissingRegistryAgents reports specialists absent from Coral registry groups', () => {
	const registry = [
		{
			identifier: { type: 'local' },
			agents: [
				{ name: SAVINGS_SPECIALISTS[0].registryName, versions: [SAVINGS_SPECIALISTS[0].version] }
			]
		}
	];

	const missing = findMissingRegistryAgents(registry);

	assert.deepEqual(
		missing,
		SAVINGS_SPECIALISTS.slice(1).map((agent) => `${agent.registryName}@${agent.version}`)
	);
});

test('findMissingRegistryAgents can inspect a linked registry source', () => {
	const registry = [
		{
			identifier: { type: 'linked', linkedServerId: 'fabrick-dev' },
			agents: SAVINGS_SPECIALISTS.map((agent) => ({
				name: agent.registryName,
				versions: [agent.version]
			}))
		}
	];

	assert.deepEqual(findMissingRegistryAgents(registry, 'fabrick-dev'), []);
	assert.deepEqual(
		findMissingRegistryAgents(registry, 'other-server'),
		SAVINGS_SPECIALISTS.map((agent) => `${agent.registryName}@${agent.version}`)
	);
});

test('readEnvFile loads unquoted and quoted values without overriding process env', () => {
	const env = readEnvFile(
		[
			'CORAL_API_KEY=from-file',
			'QUOTED="quoted-value"',
			"SINGLE='single-value'",
			'EMPTY=',
			'# ignored'
		].join('\n'),
		{ CORAL_API_KEY: 'from-process' }
	);

	assert.equal(env.CORAL_API_KEY, 'from-process');
	assert.equal(env.QUOTED, 'quoted-value');
	assert.equal(env.SINGLE, 'single-value');
	assert.equal(env.EMPTY, '');
	assert.equal(CORAL_CLOUD_API_URL, 'https://api.coralcloud.ai');
});

test('session helpers count messages and detect terminal Coral states', () => {
	const state = {
		base: { status: { type: 'closing' } },
		agents: [
			{ status: { type: 'stopped' } },
			{ status: { type: 'stopped' } }
		],
		threads: [{ messages: [{ id: 'one' }, { id: 'two' }] }, { messages: [{ id: 'three' }] }]
	};

	assert.equal(countMessages(state), 3);
	assert.equal(isTerminalSessionState(state), true);
	assert.equal(
		isTerminalSessionState({
			base: { status: { type: 'running' } },
			agents: [{ status: { type: 'running' } }],
			threads: []
		}),
		false
	);
	assert.equal(
		isTerminalSessionState({
			base: { status: { type: 'closing' } },
			agents: [{ status: { type: 'running' } }],
			threads: []
		}),
		false
	);
});
