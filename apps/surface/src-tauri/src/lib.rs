// Frontend assets are embedded at compile time via generate_context!.
use tauri_plugin_sql::{Migration, MigrationKind};

/// Register database migrations. The SQL lives in `migrations/0001_init.sql` so it
/// can be read on its own; we embed it at compile time to keep a single source of truth.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "unique index for idempotent rollups",
            sql: include_str!("../migrations/0002_rollup_unique.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "process count column on system_metrics",
            sql: include_str!("../migrations/0003_process_count.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "session fingerprint uniqueness + history indexes",
            sql: include_str!("../migrations/0004_session_fingerprint.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Opt-in "launch at login" for Surface Mode (spec §33). Registering the plugin
        // does NOT enable autostart; the user toggles it in Settings.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:ai-control-center.db", migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running AI Control Center");
}
