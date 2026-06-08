import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildCoralCompositionSessionRequest,
	buildCoralCompositionTask,
	extractCoralThreadMessages,
	findMissingCompositionAgents,
	parseCoralCompositionOutput
} from './coral-composition-report';
import type { AllocationDecision, OpportunityCard } from '$lib/savings/types';

const pools: OpportunityCard[] = [
	{
		id: 'kamino:lend:main-usdc',
		mcpOpportunityId: 'kamino:lend:main-usdc',
		product: 'lend',
		asset: 'USDC',
		title: 'USDC Main Market',
		venue: 'Kamino',
		apy: 0.041,
		tvlUsd: 100_000_000,
		riskTier: 'conservative',
		riskSynthesis: 'Deep USDC lending reserve.',
		isDefault: true,
		depositable: true,
		integrationStatus: 'tx_blueprint_known',
		limitations: [],
		availableFollowups: [],
		refs: { market: 'main', reserve: 'usdc' }
	}
];

const allocation: AllocationDecision = {
	weights: [
		{
			poolId: 'kamino:lend:main-usdc',
			title: 'USDC Main Market',
			product: 'lend',
			asset: 'USDC',
			weightPct: 100,
			apy: 0.041
		}
	],
	blendedApyPct: 4.1,
	riskEnvelope: 'Conservative',
	rebalanceStrategy: 'Review on refresh.',
	rationale: 'Single selected pool.'
};

test('buildCoralCompositionTask keeps pool selection fixed and includes report inputs', () => {
	const task = buildCoralCompositionTask({
		accountName: 'College',
		allocation,
		amountUsd: 1000,
		pools,
		riskPreference: 'conservative'
	});

	assert.match(task, /The user already selected the pool set/);
	assert.match(task, /do not propose different pools/);
	assert.match(task, /USDC Main Market/);
	assert.match(task, /"amountUsd": 1000/);
});

test('buildCoralCompositionSessionRequest creates the six prototype specialist graph', () => {
	const request = buildCoralCompositionSessionRequest({
		namespace: 'fabrick-composition-report-test',
		savingsMcpUrl: 'https://savings.example/mcp',
		task: 'Build the report.'
	}) as {
		agentGraphRequest: {
			agents: Array<{ name: string; provider: { runtime: string }; options: Record<string, { value: string }> }>;
			groups: string[][];
		};
		namespaceProvider: { namespaceRequest: { name: string } };
	};

	assert.equal(request.namespaceProvider.namespaceRequest.name, 'fabrick-composition-report-test');
	assert.equal(request.agentGraphRequest.agents.length, 6);
	assert.deepEqual(request.agentGraphRequest.groups, [
		[
			'opportunity-interpreter',
			'rate-quality',
			'exit-liquidity',
			'capacity-concentration',
			'strategy-exposure',
			'account-narrator'
		]
	]);
	assert.equal(request.agentGraphRequest.agents[0]?.provider.runtime, 'prototype');
	assert.equal(
		request.agentGraphRequest.agents[0]?.options.SAVINGS_MCP_URL.value,
		'https://savings.example/mcp'
	);
});

test('buildCoralCompositionSessionRequest can target a linked Coral registry source', () => {
	const request = buildCoralCompositionSessionRequest({
		linkedServer: 'fabrick-dev',
		namespace: 'fabrick-composition-report-test',
		savingsMcpUrl: 'https://savings.example/mcp',
		task: 'Build the report.'
	}) as {
		agentGraphRequest: {
			agents: Array<{
				id: { registrySourceId: unknown };
				provider: unknown;
			}>;
		};
	};

	assert.deepEqual(request.agentGraphRequest.agents[0]?.id.registrySourceId, {
		type: 'linked',
		linkedServerId: 'fabrick-dev'
	});
	assert.deepEqual(request.agentGraphRequest.agents[0]?.provider, {
		type: 'linked',
		linkedServerName: 'fabrick-dev',
		runtime: 'prototype'
	});
});

test('findMissingCompositionAgents reports absent local and linked specialists', () => {
	const localRegistry = [
		{
			identifier: { type: 'local' },
			agents: [{ name: 'fabrick-opp-interpreter', versions: ['0.1.0'] }]
		}
	];
	const missingLocal = findMissingCompositionAgents(localRegistry);
	assert.equal(missingLocal.length, 5);
	assert.ok(missingLocal.includes('fabrick-rate-quality@0.1.0'));

	const linkedRegistry = [
		{
			identifier: { type: 'linked', linkedServerId: 'fabrick-dev' },
			agents: [
				{ name: 'fabrick-opp-interpreter', versions: ['0.1.0'] },
				{ name: 'fabrick-rate-quality', versions: ['0.1.0'] },
				{ name: 'fabrick-exit-liquidity', versions: ['0.1.0'] },
				{ name: 'fabrick-capacity-risk', versions: ['0.1.0'] },
				{ name: 'fabrick-exposure', versions: ['0.1.0'] },
				{ name: 'fabrick-strategy-narrator', versions: ['0.1.0'] }
			]
		}
	];
	assert.deepEqual(findMissingCompositionAgents(linkedRegistry, 'fabrick-dev'), []);
	assert.equal(findMissingCompositionAgents(linkedRegistry, 'other').length, 6);
});

test('parseCoralCompositionOutput prefers structured narrator report JSON', () => {
	const state = {
		threads: [
			{
				messages: [
					{
						senderName: 'account-narrator',
						content: `Final preview.\n\nFABRICK_REPORT_JSON\n\n\`\`\`json\n{
  "narratorCopy": {
    "overview": "Agents prefer a balanced split across the selected pools.",
    "weightingRationale": "Weights lean larger toward deeper conservative sleeves.",
    "rebalancing": "Review if APY source quality or liquidity changes."
  },
  "keyWarnings": ["One selected pool is market-data-only in Fabrick."],
  "findings": [
    {
      "specialist": "rate",
      "title": "Rate durability",
      "severity": "watch",
      "body": "Headline APY should be treated as current-only until more history is available."
    }
  ]
}\n\`\`\``
					}
				]
			}
		]
	};

	const output = parseCoralCompositionOutput(state);
	assert.ok(output);
	assert.equal(output.messageCount, 1);
	assert.equal(output.findings[0]?.specialist, 'rate');
	assert.equal(output.findings[0]?.severity, 'watch');
	assert.equal(output.keyWarnings[0], 'One selected pool is market-data-only in Fabrick.');
	assert.equal(
		output.narratorCopy?.weightingRationale,
		'Weights lean larger toward deeper conservative sleeves.'
	);
});

test('parseCoralCompositionOutput extracts loose specialist thread messages', () => {
	const state = {
		threads: [
			{
				messages: [
					{
						senderName: 'rate-quality',
						content:
							'Rate quality specialist: APY looks spike-prone and short-window, so treat the blended rate as a preview not durable yield.'
					},
					{
						senderName: 'exit-liquidity',
						content:
							'Exit liquidity specialist: withdrawal buffer is limited; separate protocol exit risk from Fabrick execution readiness.'
					}
				]
			}
		]
	};

	const messages = extractCoralThreadMessages(state);
	assert.equal(messages.length, 2);

	const output = parseCoralCompositionOutput(state);
	assert.ok(output);
	assert.equal(output.findings.length, 2);
	assert.equal(output.findings[0]?.specialist, 'rate');
	assert.equal(output.findings[0]?.severity, 'watch');
	assert.equal(output.findings[1]?.specialist, 'liquidity');
	assert.ok(output.keyWarnings.length >= 1);
});

test('parseCoralCompositionOutput ignores narrator instruction echoes and bounds loose findings', () => {
	const state = {
		threads: [
			{
				messages: [
					{
						senderName: 'account-narrator',
						content:
							'Smoke workflow: you will receive fixed selected pools + allocation preview weights. Please reply with concise findings ONLY. Selected pools (fixed): kamino:lend:Atj6UREVVwa7WxbF2EMKNyfmYUY1U1txughe2gjhcPDCo.'
					},
					{
						senderName: 'capacity-concentration',
						content:
							'Capacity/Concentration findings for Balanced (amountUsd=1000): concentration is heavily Kamino (82.3% max venue; 99.9% across lending reserves). Within Kamino, three sleeves sum to 82.3% with the largest single sleeve Maple at 35.3%. Thin/fragmentation flags appear for Maple venue capacity, which may be less forgiving to incremental deposits even though current amount is modest. Preview-safe warning: concentration materially increases vs diversified stance if % to Kamino remains >80% - main risk is venue/capacity concentration rather than broad pool-count fragmentation. Rebalance'
					}
				]
			}
		]
	};

	const output = parseCoralCompositionOutput(state);
	assert.ok(output);
	assert.equal(output.findings.length, 1);
	assert.equal(output.findings[0]?.specialist, 'capacity');
	assert.doesNotMatch(output.findings[0]?.body ?? '', /Smoke workflow/);
	assert.ok((output.findings[0]?.body.length ?? 0) <= 423);
	assert.ok(output.keyWarnings.every((warning) => warning.length <= 263));
});
