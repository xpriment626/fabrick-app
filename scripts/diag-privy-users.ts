/**
 * Throwaway diagnostic — query Privy for all users matching an email,
 * print their DIDs + linked accounts so we can see if duplicates exist.
 *
 * Run: npx tsx scripts/diag-privy-users.ts emmett@zrodivision.com
 */

import { PrivyClient } from '@privy-io/server-auth'
import { readFileSync } from 'node:fs'

// Minimal .env loader — avoids adding dotenv just for a throwaway.
for (const line of readFileSync('.env', 'utf8').split('\n')) {
	const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/i.exec(line.trim())
	if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const email = process.argv[2]
if (!email) {
	console.error('Usage: tsx scripts/diag-privy-users.ts <email>')
	process.exit(1)
}

const appId = process.env.PUBLIC_PRIVY_APP_ID
const appSecret = process.env.PRIVY_APP_SECRET
if (!appId || !appSecret) {
	console.error('Missing PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET in .env')
	process.exit(1)
}

const client = new PrivyClient(appId, appSecret)

async function main() {
	console.log(`Querying Privy app ${appId} for users with email "${email}"...\n`)

	// 1) Targeted: getUserByEmail returns the canonical match (Privy's
	//    own answer to "which user owns this email"). If null, the email
	//    isn't a primary identity on any user.
	const direct = await client.getUserByEmail(email).catch((err) => {
		console.error('getUserByEmail threw:', err?.message ?? err)
		return null
	})
	if (direct) {
		console.log('getUserByEmail() → 1 user:')
		dumpUser(direct)
	} else {
		console.log('getUserByEmail() → null (no user has this as a verified email)')
	}
	console.log()

	// 2) Bulk lookup via getUsers({ emails: [...] }) — catches a SECOND
	//    user that has this email as a linked account even when
	//    getUserByEmail returned a different canonical owner. The
	//    positional-searchTerm overload was deprecated by Privy; the
	//    structured form is the supported path.
	console.log(`getUsers({ emails: [...] }) → bulk lookup by email...`)
	const matches = await client.getUsers({ emails: [email] }).catch((err) => {
		console.error('getUsers threw:', err?.message ?? err)
		return [] as Awaited<ReturnType<typeof client.getUsers>>
	})
	console.log(`getUsers() → ${matches.length} user(s):\n`)
	for (const u of matches) dumpUser(u)
}

function dumpUser(u: Awaited<ReturnType<typeof client.getUserByEmail>>) {
	if (!u) return
	console.log(`  DID: ${u.id}`)
	console.log(`  Created: ${u.createdAt}`)
	console.log(`  Linked accounts:`)
	for (const acct of u.linkedAccounts ?? []) {
		const summary = acct as Record<string, unknown>
		const t = summary.type
		const detail =
			t === 'email'
				? summary.address
				: t === 'wallet'
					? `${summary.chainType ?? '?'}/${summary.address ?? '?'} (${summary.walletClientType ?? '?'})`
					: t === 'twitter_oauth'
						? `@${summary.username ?? summary.subject ?? '?'}`
						: t === 'phone'
							? summary.number
							: JSON.stringify(summary).slice(0, 100)
		console.log(`    - ${t}: ${detail}`)
	}
	console.log()
}

main()
	.catch((err) => {
		console.error('Diagnostic failed:', err)
		process.exit(1)
	})
	.then(() => process.exit(0))
