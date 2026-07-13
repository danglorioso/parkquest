// One-off: migrates the 22 originally code-defined badges into real
// custom_badges rows (same badge_id, so existing user_badges/posts keep
// pointing at them), then drops the now-unused badge_overrides table.
// Run once per environment: node --env-file=.env.local scripts/seed-launch-badges.mjs
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

const badges = [
  ['first_steps', 'First Steps', 'Visited your very first national park', '🌱', 'bronze', [{ type: 'parks_visited', count: 1 }]],
  ['trail_walker', 'Trail Walker', 'Visited 5 national parks', '🥾', 'bronze', [{ type: 'parks_visited', count: 5 }]],
  ['camp_wanderer', 'Camp Wanderer', 'Visited 10 national parks', '🏕️', 'silver', [{ type: 'parks_visited', count: 10 }]],
  ['sharp_eye', 'Sharp Eye', 'Visited 25 national parks', '🦅', 'silver', [{ type: 'parks_visited', count: 25 }]],
  ['true_explorer', 'True Explorer', 'Visited 50 national parks', '🗺️', 'gold', [{ type: 'parks_visited', count: 50 }]],
  ['peak_climber', 'Peak Climber', 'Visited 75 national parks', '🏔️', 'gold', [{ type: 'parks_visited', count: 75 }]],
  ['century_club', 'Century Club', 'Visited 100 national parks', '⭐', 'gold', [{ type: 'parks_visited', count: 100 }]],
  ['star_ranger', 'Star Ranger', 'Visited 150 national parks', '🌟', 'platinum', [{ type: 'parks_visited', count: 150 }]],
  ['horizon_chaser', 'Horizon Chaser', 'Visited 200 national parks', '🌄', 'platinum', [{ type: 'parks_visited', count: 200 }]],
  ['wild_at_heart', 'Wild At Heart', 'Visited 300 national parks', '🦁', 'legendary', [{ type: 'parks_visited', count: 300 }]],
  ['park_legend', 'Park Legend', 'Visited every single national park', '👑', 'legendary', [{ type: 'all_parks_visited' }]],
  ['state_hopper', 'State Hopper', 'Visited parks in 3 different states', '🧭', 'bronze', [{ type: 'states_visited', count: 3 }]],
  ['cross_country', 'Cross Country', 'Visited parks in 7 different states', '🌎', 'silver', [{ type: 'states_visited', count: 7 }]],
  ['all_american', 'All-American', 'Visited parks in 15 different states', '🗽', 'gold', [{ type: 'states_visited', count: 15 }]],
  ['continental', 'Continental', 'Visited parks in 30 different states', '🌐', 'platinum', [{ type: 'states_visited', count: 30 }]],
  ['united_legend', 'United Legend', 'Visited parks in all 50 states', '🏛️', 'legendary', [{ type: 'states_visited', count: 50 }]],
  ['wishful_thinker', 'Wishful Thinker', 'Added 5 parks to your bucket list', '📋', 'bronze', [{ type: 'bucket_list_count', count: 5 }]],
  ['big_dreamer', 'Big Dreamer', 'Added 15 parks to your bucket list', '✨', 'silver', [{ type: 'bucket_list_count', count: 15 }]],
  ['visionary', 'Visionary', 'Added 30 parks to your bucket list', '🌠', 'gold', [{ type: 'bucket_list_count', count: 30 }]],
  ['hot_streak', 'Hot Streak', 'Visited 5 parks in a single calendar year', '🔥', 'silver', [{ type: 'visits_in_year', count: 5 }]],
  ['year_adventurer', 'Year Adventurer', 'Visited 10 parks in a single calendar year', '🚀', 'gold', [{ type: 'visits_in_year', count: 10 }]],
  ['park_obsessed', 'Park Obsessed', 'Visited 20 parks in a single calendar year', '💫', 'platinum', [{ type: 'visits_in_year', count: 20 }]],
];

let inserted = 0, skipped = 0;
for (const [badge_id, name, description, emoji, tier, conditions] of badges) {
  const rows = await sql`
    INSERT INTO custom_badges (badge_id, name, description, emoji, tier, conditions, enabled)
    VALUES (${badge_id}, ${name}, ${description}, ${emoji}, ${tier}, ${JSON.stringify(conditions)}, true)
    ON CONFLICT (badge_id) DO NOTHING
    RETURNING badge_id
  `;
  if (rows.length > 0) inserted++; else skipped++;
}

await sql`DROP TABLE IF EXISTS badge_overrides`;

console.log(`seeded: ${inserted} inserted, ${skipped} already present. badge_overrides dropped.`);
