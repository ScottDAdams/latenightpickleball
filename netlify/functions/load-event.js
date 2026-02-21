import { neon } from '@netlify/neon';
const sql = neon();

export default async (req) => {
  try {
    const url = new URL(req.url);
    const eventId = url.searchParams.get('event');
    if (!eventId) {
      return new Response(JSON.stringify({ error: 'Event ID required' }), { status: 400 });
    }

    const [event] = await sql`SELECT * FROM events WHERE id = ${eventId}`;
    if (!event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404 });
    }

    const teams = await sql`SELECT name, wins FROM teams WHERE event_id = ${eventId}`;
    const matches = await sql`
      SELECT round, team1, team2, winner, court
      FROM matches
      WHERE event_id = ${eventId}
      ORDER BY round, court;
    `;

    return new Response(JSON.stringify({ event, teams, matches }), { status: 200 });
  } catch (err) {
    console.error('❌ Error in load-event:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
