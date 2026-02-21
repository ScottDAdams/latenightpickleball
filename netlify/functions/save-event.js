import { neon } from '@netlify/neon';
const sql = neon();

// Helper function to generate a short, random ID
function generateShortId(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default async (req) => {
  try {
    const body = await req.json();
    const {
      eventId,
      name,
      config,
      round,
      status,
      current_round_start,
      countdown_start,
      teams,
      matches
    } = body;

    let id = eventId;

    if (!id) {
      // ✅ Generate a new short ID for new events
      id = generateShortId();
      await sql`
        INSERT INTO events (id, name, config, round, status, current_round_start, countdown_start)
        VALUES (${id}, ${name}, ${JSON.stringify(config)}, ${round || 0}, ${status || 'idle'}, ${current_round_start || null}, ${countdown_start || null});
      `;
    } else {
      // ✅ Update existing event
      await sql`
        UPDATE events
        SET name = ${name},
            config = ${JSON.stringify(config)},
            round = ${round || 0},
            status = ${status || 'idle'},
            current_round_start = ${current_round_start || null},
            countdown_start = ${countdown_start || null}
        WHERE id = ${id};
      `;

      // Clear previous teams/matches for this event
      await sql`DELETE FROM teams WHERE event_id = ${id};`;
      await sql`DELETE FROM matches WHERE event_id = ${id};`;
    }

    // ✅ Insert Teams
    if (teams && teams.length > 0) {
      for (const t of teams) {
        await sql`
          INSERT INTO teams (event_id, name, wins)
          VALUES (${id}, ${t.name}, ${t.wins || 0});
        `;
      }
    }

    // ✅ Insert Matches
    if (matches && matches.length > 0) {
      for (const m of matches) {
        await sql`
          INSERT INTO matches (event_id, round, team1, team2, winner, court)
          VALUES (${id}, ${m.round || round}, ${m.team1}, ${m.team2}, ${m.winner || null}, ${m.court || null});
        `;
      }
    }

    return new Response(JSON.stringify({ success: true, eventId: id }), { status: 200 });
  } catch (err) {
    console.error('❌ Error in save-event:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};