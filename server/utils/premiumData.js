const DEFAULT_PLANS = [
    {
        code: "premium-monthly",
        name: "Premium",
        price_label: "$4.99 / month",
        billing_period: "monthly",
        is_active: true,
        description: "Unlock premium puzzles and curated YouTube lesson collections."
    }
];

const DEFAULT_PUZZLES = [
    {
        slug: "queen-net-1",
        title: "Queen Net",
        description: "White to move and force a clean queen mate in one.",
        fen: "8/1Q6/2K5/k7/8/8/8/8 w - - 0 1",
        solution_moves: ["b7b5"],
        difficulty: "Beginner",
        theme: "Mate in 1",
        is_premium: false
    },
    {
        slug: "rook-lift-1",
        title: "Rook Lift",
        description: "White to move and deliver a textbook rook mate.",
        fen: "7k/8/6K1/8/8/8/8/R7 w - - 0 1",
        solution_moves: ["a1a8"],
        difficulty: "Beginner",
        theme: "Mate in 1",
        is_premium: false
    },
    {
        slug: "queen-cage",
        title: "Queen Cage",
        description: "Use the queen to seal every escape square in one move.",
        fen: "8/1Q6/2K5/8/k7/8/8/8 w - - 0 1",
        solution_moves: ["b7b4"],
        difficulty: "Intermediate",
        theme: "Mate in 1",
        is_premium: true
    },
    {
        slug: "queen-lift",
        title: "Queen Lift",
        description: "White to move and climb to the final mating square.",
        fen: "7k/8/5KQ1/8/8/8/8/8 w - - 0 1",
        solution_moves: ["g6g7"],
        difficulty: "Intermediate",
        theme: "Mate in 1",
        is_premium: true
    },
    {
        slug: "queen-slide",
        title: "Queen Slide",
        description: "Slide the queen into place and leave the king boxed in.",
        fen: "7k/8/5K2/6Q1/8/8/8/8 w - - 0 1",
        solution_moves: ["g5g7"],
        difficulty: "Intermediate",
        theme: "Mate in 1",
        is_premium: true
    },
    {
        slug: "rook-finish",
        title: "Rook Finish",
        description: "White to move and finish the attack with a vertical rook mate.",
        fen: "7k/8/5K2/8/8/8/8/6R1 w - - 0 1",
        solution_moves: ["g1g8"],
        difficulty: "Intermediate",
        theme: "Mate in 1",
        is_premium: true
    },
    {
        slug: "ladder-mate",
        title: "Rook Net",
        description: "Use the rook to trap the king with no escape squares left.",
        fen: "6k1/8/5K2/8/8/8/8/7R w - - 0 1",
        solution_moves: ["h1h8"],
        difficulty: "Advanced",
        theme: "Mate in 1",
        is_premium: true
    }
];

const DEFAULT_VIDEO_LESSONS = [
    {
        slug: "opening-principles",
        title: "Opening Principles",
        description: "A curated YouTube search for core opening development ideas.",
        youtube_url: "https://www.youtube.com/results?search_query=chess+opening+principles",
        youtube_video_id: null,
        category: "Openings",
        is_premium: false,
        sort_order: 1
    },
    {
        slug: "tactics-patterns",
        title: "Tactics Patterns",
        description: "Curated YouTube results focused on forks, pins, skewers, and tactical motifs.",
        youtube_url: "https://www.youtube.com/results?search_query=chess+tactics+forks+pins+skewers",
        youtube_video_id: null,
        category: "Tactics",
        is_premium: true,
        sort_order: 2
    },
    {
        slug: "endgame-fundamentals",
        title: "Endgame Fundamentals",
        description: "Curated YouTube results for king-and-pawn endgames and practical conversion technique.",
        youtube_url: "https://www.youtube.com/results?search_query=chess+king+and+pawn+endgames",
        youtube_video_id: null,
        category: "Endgames",
        is_premium: true,
        sort_order: 3
    },
    {
        slug: "attacking-the-king",
        title: "Attacking The King",
        description: "A curated lesson path for mating attacks, piece coordination, and direct king pressure.",
        youtube_url: "https://www.youtube.com/results?search_query=chess+attacking+the+king+tutorial",
        youtube_video_id: null,
        category: "Attack",
        is_premium: true,
        sort_order: 4
    },
    {
        slug: "positional-chess",
        title: "Positional Chess",
        description: "Curated results around weak squares, outposts, piece activity, and long-term planning.",
        youtube_url: "https://www.youtube.com/results?search_query=positional+chess+strategy+tutorial",
        youtube_video_id: null,
        category: "Strategy",
        is_premium: true,
        sort_order: 5
    },
    {
        slug: "defensive-skills",
        title: "Defensive Skills",
        description: "Curated lessons on defending tough positions, reducing counterplay, and surviving pressure.",
        youtube_url: "https://www.youtube.com/results?search_query=chess+defense+tutorial",
        youtube_video_id: null,
        category: "Defense",
        is_premium: true,
        sort_order: 6
    }
];

let premiumSchemaEnsured = false;

async function ensurePremiumSchema(pool) {
    if (premiumSchemaEnsured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS subscription_plans (
            id SERIAL PRIMARY KEY,
            code VARCHAR(60) UNIQUE NOT NULL,
            name VARCHAR(80) NOT NULL,
            price_label VARCHAR(80) NOT NULL,
            billing_period VARCHAR(40) NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
            status VARCHAR(40) NOT NULL DEFAULT 'active',
            provider VARCHAR(40) NOT NULL DEFAULT 'manual',
            provider_ref VARCHAR(120),
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS puzzles (
            id SERIAL PRIMARY KEY,
            slug VARCHAR(80) UNIQUE NOT NULL,
            title VARCHAR(120) NOT NULL,
            description TEXT,
            fen TEXT NOT NULL,
            source_name VARCHAR(40) DEFAULT 'seed',
            source_fen TEXT,
            first_move_uci VARCHAR(12),
            solution_moves JSONB NOT NULL DEFAULT '[]'::jsonb,
            difficulty VARCHAR(40),
            theme VARCHAR(60),
            rating INTEGER,
            popularity INTEGER,
            nb_plays INTEGER,
            game_url TEXT,
            opening_tags TEXT,
            imported_at TIMESTAMP,
            is_premium BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        ALTER TABLE puzzles
        ADD COLUMN IF NOT EXISTS source_name VARCHAR(40) DEFAULT 'seed',
        ADD COLUMN IF NOT EXISTS source_fen TEXT,
        ADD COLUMN IF NOT EXISTS first_move_uci VARCHAR(12),
        ADD COLUMN IF NOT EXISTS rating INTEGER,
        ADD COLUMN IF NOT EXISTS popularity INTEGER,
        ADD COLUMN IF NOT EXISTS nb_plays INTEGER,
        ADD COLUMN IF NOT EXISTS game_url TEXT,
        ADD COLUMN IF NOT EXISTS opening_tags TEXT,
        ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS video_lessons (
            id SERIAL PRIMARY KEY,
            slug VARCHAR(80) UNIQUE NOT NULL,
            title VARCHAR(140) NOT NULL,
            description TEXT,
            youtube_url TEXT NOT NULL,
            youtube_video_id VARCHAR(40),
            category VARCHAR(60),
            is_premium BOOLEAN DEFAULT TRUE,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_puzzles_premium ON puzzles(is_premium)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_video_lessons_premium ON video_lessons(is_premium)`);

    for (const plan of DEFAULT_PLANS) {
        await pool.query(
            `INSERT INTO subscription_plans (code, name, price_label, billing_period, description, is_active)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (code) DO UPDATE
             SET name = EXCLUDED.name,
                 price_label = EXCLUDED.price_label,
                 billing_period = EXCLUDED.billing_period,
                 description = EXCLUDED.description,
                 is_active = EXCLUDED.is_active`,
            [plan.code, plan.name, plan.price_label, plan.billing_period, plan.description, plan.is_active]
        );
    }

    for (const puzzle of DEFAULT_PUZZLES) {
        await pool.query(
            `INSERT INTO puzzles (
                slug,
                title,
                description,
                fen,
                source_name,
                source_fen,
                first_move_uci,
                solution_moves,
                difficulty,
                theme,
                rating,
                popularity,
                nb_plays,
                game_url,
                opening_tags,
                imported_at,
                is_premium
             )
             VALUES (
                $1, $2, $3, $4, 'seed', $4, NULL, $5::jsonb, $6, $7, NULL, NULL, NULL, NULL, NULL, NULL, $8
             )
             ON CONFLICT (slug) DO UPDATE
             SET title = EXCLUDED.title,
                 description = EXCLUDED.description,
                 fen = EXCLUDED.fen,
                 source_name = EXCLUDED.source_name,
                 source_fen = EXCLUDED.source_fen,
                 first_move_uci = EXCLUDED.first_move_uci,
                 solution_moves = EXCLUDED.solution_moves,
                 difficulty = EXCLUDED.difficulty,
                 theme = EXCLUDED.theme,
                 rating = EXCLUDED.rating,
                 popularity = EXCLUDED.popularity,
                 nb_plays = EXCLUDED.nb_plays,
                 game_url = EXCLUDED.game_url,
                 opening_tags = EXCLUDED.opening_tags,
                 imported_at = EXCLUDED.imported_at,
                 is_premium = EXCLUDED.is_premium`,
            [
                puzzle.slug,
                puzzle.title,
                puzzle.description,
                puzzle.fen,
                JSON.stringify(puzzle.solution_moves),
                puzzle.difficulty,
                puzzle.theme,
                puzzle.is_premium
            ]
        );
    }

    for (const lesson of DEFAULT_VIDEO_LESSONS) {
        await pool.query(
            `INSERT INTO video_lessons (slug, title, description, youtube_url, youtube_video_id, category, is_premium, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (slug) DO UPDATE
             SET title = EXCLUDED.title,
                 description = EXCLUDED.description,
                 youtube_url = EXCLUDED.youtube_url,
                 youtube_video_id = EXCLUDED.youtube_video_id,
                 category = EXCLUDED.category,
                 is_premium = EXCLUDED.is_premium,
                 sort_order = EXCLUDED.sort_order`,
            [
                lesson.slug,
                lesson.title,
                lesson.description,
                lesson.youtube_url,
                lesson.youtube_video_id,
                lesson.category,
                lesson.is_premium,
                lesson.sort_order
            ]
        );
    }

    premiumSchemaEnsured = true;
}

async function getActiveSubscription(pool, userId) {
    await ensurePremiumSchema(pool);

    const result = await pool.query(
        `SELECT us.*, sp.name AS plan_name, sp.code AS plan_code, sp.price_label, sp.billing_period, sp.description
         FROM user_subscriptions us
         JOIN subscription_plans sp ON sp.id = us.plan_id
         WHERE us.user_id = $1
           AND us.status = 'active'
           AND (us.expires_at IS NULL OR us.expires_at > NOW())
         ORDER BY us.updated_at DESC, us.id DESC
         LIMIT 1`,
        [userId]
    );

    return result.rows[0] || null;
}

function mapSubscriptionStatus(subscriptionRow) {
    if (!subscriptionRow) {
        return {
            isPremium: false,
            status: "inactive",
            planName: null,
            planCode: null,
            priceLabel: null,
            billingPeriod: null,
            description: null,
            startedAt: null,
            expiresAt: null,
            provider: null
        };
    }

    return {
        isPremium: true,
        status: subscriptionRow.status,
        planName: subscriptionRow.plan_name,
        planCode: subscriptionRow.plan_code,
        priceLabel: subscriptionRow.price_label,
        billingPeriod: subscriptionRow.billing_period,
        description: subscriptionRow.description,
        startedAt: subscriptionRow.started_at,
        expiresAt: subscriptionRow.expires_at,
        provider: subscriptionRow.provider
    };
}

module.exports = {
    ensurePremiumSchema,
    getActiveSubscription,
    mapSubscriptionStatus
};
