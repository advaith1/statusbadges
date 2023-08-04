import { load } from "https://deno.land/std@0.196.0/dotenv/mod.ts";
const env = await load()

import { Hono } from 'https://deno.land/x/hono@v3.3.1/mod.ts'

import { REST } from 'npm:@discordjs/rest@^2.0.0'
import { WebSocketManager } from 'npm:@discordjs/ws@^1.0.0'
import { GatewayDispatchEvents, GatewayIntentBits, Client, GatewayPresenceUpdate, ActivityType, PresenceUpdateStatus } from 'npm:@discordjs/core@^1.0.0'

import 'npm:bufferutil@^4.0.7'

import { makeBadge } from 'npm:badge-maker@^3.3.1'

import logos from './logos.json' assert { type: 'json' }
const { vscode, intellij, spotify, crunchyroll } = logos

const rest = new REST().setToken(env.TOKEN)

const gateway = new WebSocketManager({
	token: env.TOKEN,
	intents: GatewayIntentBits.Guilds | GatewayIntentBits.GuildPresences,
	rest
})

const client = new Client({ rest, gateway })

const presences = new Map<string, GatewayPresenceUpdate>()

client.once(GatewayDispatchEvents.Ready, (e) => {
	console.log('Ready!', e.data)
})

client.on(GatewayDispatchEvents.GuildCreate, e => {
	for (const presence of e.data.presences) {
		presences.set(presence.user.id, presence)
	}
})

client.on(GatewayDispatchEvents.PresenceUpdate, e => {
	presences.set(e.data.user.id, e.data)
})

gateway.connect()

/** 
 * Adds a logo and updates positions
 * unfortunately, shields' badge-maker library doesn't support their logo system
 * so I modify the generated svg to inject the logo
 * this only supports the "flat", "flat-square", and "plastic" styles
 * so this is skipped for "social" and "for-the-badge"
 */
const injectLogo = (svg: string, logo: string) => {
	svg = svg.replace('<text', `<image x="5" y="3" width="14" height="14" xlink:href="data:image/svg+xml;base64,${logo}"/><text`)

	// add 17 to the svg's full width in all the places it's in
	const fullWidthArr = svg.match(/width="(\d+?)"/)!
	svg = svg.replace(new RegExp(fullWidthArr[0], 'g'), `width="${+fullWidthArr[1]+17}"`)

	// add 17 to gray part width, fallback for flat-square support
	const [,grayWidth] = svg.match(/\)"><rect width="(\d+?)"/) || svg.match(/"><rect width="(\d+?)"/)!
	svg = svg.replace(new RegExp(`="${grayWidth}"`, 'g'), `="${+grayWidth+17}"`)

	// adds 170 to text positions
	svg = svg.replace(/("|xt) x="(\d+?)"/g, (_, start, pos) => `${start} x="${+pos+170}"`)

	return svg
}

const colors = { online: 'brightgreen', idle: 'yellow', dnd: 'red', offline: 'lightgray' }

const resolveStyle = (style?: string) =>
	style === 'plastic' || style === 'flat' || style === 'flat-square' || style === 'for-the-badge' || style === 'social' ? style : 'flat'

const formatter = new Intl.ListFormat()

const app = new Hono()

app.get('/', c => c.redirect('https://statusbadges.me'))

app.get('/badge/status/:id', c => {
	const realStatus = presences.get(c.req.param('id'))?.status ?? PresenceUpdateStatus.Offline

	const status = c.req.query('simple') === 'true'
		? [PresenceUpdateStatus.Idle, PresenceUpdateStatus.DoNotDisturb].includes(realStatus)
			? PresenceUpdateStatus.Online
			: realStatus
		: realStatus

	c.header('Content-Type', 'image/svg+xml; charset=utf-8')
	c.header('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate')

	return c.body(makeBadge({
		label: c.req.query('label') ?? 'currently',
		message: status,
		labelColor: c.req.query('labelColor') ?? 'gray',
		color: c.req.query('color') ?? colors[status],
		style: resolveStyle(c.req.query('style'))
	}))
})

app.get('/badge/playing/:id', c => {
	const activities = presences.get(c.req.param('id'))?.activities
		?.filter(a => a.type === ActivityType.Playing && !['Visual Studio Code', 'IntelliJ IDEA Ultimate'].includes(a.name)) ?? []

	c.header('Content-Type', 'image/svg+xml; charset=utf-8')
	c.header('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate')

	return c.body(makeBadge({
		label: c.req.query('label') ?? 'playing',
		message: formatter.format(activities.map(a => a.name)) || c.req.query('fallback') || 'nothing rn',
		labelColor: c.req.query('labelColor') ?? 'gray',
		color: c.req.query('color') ?? '#5865f2',
		style: resolveStyle(c.req.query('style'))
	}))
})

app.get('/badge/vscode/:id', c => {
	const activity = presences.get(c.req.param('id'))?.activities?.find(a => a.name === 'Visual Studio Code' && a.details && a.state)

	c.header('Content-Type', 'image/svg+xml; charset=utf-8')
	c.header('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate')

	const style = resolveStyle(c.req.query('style'))

	let badge = makeBadge({
		label: c.req.query('label') ?? 'coding',
		message: activity && activity.details && activity.state
			? `${activity.details.replace('Editing ', '')} in ${activity.state.replace(/(Workspace: | \(Workspace\))/g, '').replace('Glitch:', '🎏')}`
			: c.req.query('fallback') ?? 'nothing rn',
		labelColor: c.req.query('labelColor') ?? 'gray',
		color: c.req.query('color') ?? '#23a7f2',
		style
	})

	if (!['social', 'for-the-badge'].includes(style) && c.req.query('hideLogo') !== 'true')
		badge = injectLogo(badge, vscode)

	return c.body(badge)
})

app.get('/badge/intellij/:id', c => {
	const activity = presences.get(c.req.param('id'))?.activities?.find(a => a.name === 'IntelliJ IDEA Ultimate' && a.details && a.state && a.state !== 'Idling')

	c.header('Content-Type', 'image/svg+xml; charset=utf-8')
	c.header('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate')

	const style = resolveStyle(c.req.query('style'))

	let badge = makeBadge({
		label: c.req.query('label') ?? 'coding',
		message: activity && activity.details && activity.state
			? `${activity.details.replace('Editing ', '')} in ${activity.state}`
			: c.req.query('fallback') ?? 'nothing rn',
		labelColor: c.req.query('labelColor') ?? 'gray',
		color: c.req.query('color') ?? '#fe315d',
		style
	})

	if (!['social', 'for-the-badge'].includes(style) && c.req.query('hideLogo') !== 'true')
		badge = injectLogo(badge, intellij)

	return c.body(badge)
})

app.get('/badge/spotify/:id', c => {
	const activity = presences.get(c.req.param('id'))?.activities?.find(a => a.type === ActivityType.Listening && a.name === 'Spotify' && a.details && a.state)

	c.header('Content-Type', 'image/svg+xml; charset=utf-8')
	c.header('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate')

	const style = resolveStyle(c.req.query('style'))

	let badge = makeBadge({
		label: c.req.query('label') ?? 'listening to',
		message: activity && activity.details && activity.state
			? `${activity.details.replace(/\(.*\)/g, '')} by ${formatter.format(activity.state.split('; '))}`
			: c.req.query('fallback') ?? 'nothing rn',
			labelColor: c.req.query('labelColor') ?? 'gray',
			color: c.req.query('color') ?? '#1db954',
		style
	})

	if (!['social', 'for-the-badge'].includes(style) && c.req.query('hideLogo') !== 'true')
		badge = injectLogo(badge, spotify)

	return c.body(badge)
})

app.get('/badge/crunchyroll/:id', c => {
	const activity = presences.get(c.req.param('id'))?.activities?.find(a => a.type === ActivityType.Watching && a.name === 'Crunchyroll' && a.details)

	c.header('Content-Type', 'image/svg+xml; charset=utf-8')
	c.header('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate')

	const style = resolveStyle(c.req.query('style'))

	let badge = makeBadge({
		label: c.req.query('label') ?? 'watching',
		message: activity && activity.details
			? activity.details
			: c.req.query('fallback') ?? 'nothing rn',
			labelColor: c.req.query('labelColor') ?? 'gray',
			color: c.req.query('color') ?? '#f47521',
		style
	})

	if (!['social', 'for-the-badge'].includes(style) && c.req.query('hideLogo') !== 'true')
		badge = injectLogo(badge, crunchyroll)

	return c.body(badge)
})

app.get('/presence/:id', c => {
	const presence = presences.get(c.req.param('id'))
	if (!presence) return c.json({ status: PresenceUpdateStatus.Offline, client_status: {}, activities: [] })
	return c.json({ ...presence, user: undefined })
})

app.get('/openspotify/:id', c => {
	const presence = presences.get(c.req.param('id'))
	const spotifyActivity = presence?.activities?.find(a => a.name === 'Spotify' && a.type === ActivityType.Listening && a.sync_id)
	if (!spotifyActivity) return c.text("This user isn't listening to Spotify.")

	return c.redirect(`https://open.spotify.com/track/${spotifyActivity.sync_id}`)
})

Deno.serve({ port: +env.PORT }, app.fetch)
