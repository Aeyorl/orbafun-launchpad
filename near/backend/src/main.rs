use anyhow::Result;
use std::env;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(env::var("RUST_LOG").unwrap_or_else(|_| "info".into()))
        .init();
    let router = orba_near_api::app_router_with_indexer(true).await?;
    let address = env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:4001".into());
    let listener = tokio::net::TcpListener::bind(&address).await?;
    tracing::info!(%address, "Orba NEAR API listening");
    axum::serve(listener, router).await?;
    Ok(())
}
