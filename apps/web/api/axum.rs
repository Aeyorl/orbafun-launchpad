use tower::ServiceBuilder;
use vercel_runtime::{Error, axum::VercelLayer};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let app = orba_near_api::app_router().await?;
    let service = ServiceBuilder::new().layer(VercelLayer::new()).service(app);
    vercel_runtime::run(service).await
}
