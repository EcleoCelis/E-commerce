import click

from backend.app.extensions import db
from backend.app.seed import ensure_admin_user, seed_catalog_data, seed_development_data


def register_cli_commands(app):
    @app.cli.command("init-db")
    def init_db():
        if app.config["ENV_NAME"] == "production":
            raise click.ClickException("Refusing to create tables directly in production. Use migrations instead.")

        db.create_all()
        click.echo("Database tables created.")

    @app.cli.command("seed-dev")
    def seed_dev():
        if app.config["ENV_NAME"] == "production":
            raise click.ClickException("Refusing to seed development data in production.")

        db.create_all()
        created = seed_development_data()
        click.echo(
            f"Seed complete. Created users={created['users']}, "
            f"categories={created['categories']}, products={created['products']}."
        )

    @app.cli.command("seed-catalog")
    @click.option("--if-empty", is_flag=True, default=False, help="Skip seeding if categories or products already exist.")
    def seed_catalog(if_empty):
        """Seed catalog categories, products, and image references safely."""
        created = seed_catalog_data(only_if_empty=if_empty)
        if created.get("skipped"):
            click.echo("Catalog seed skipped: categories or products already exist.")
            return
        click.echo(
            f"Catalog seed complete. Created users={created['users']}, "
            f"categories={created['categories']}, products={created['products']}."
        )

    @app.cli.command("ensure-admin")
    @click.option(
        "--email",
        default=None,
        help="Admin email (defaults to SEED_ADMIN_EMAIL or admin@secondmarket.test).",
    )
    @click.option(
        "--password",
        default=None,
        help="Admin password (defaults to SEED_ADMIN_PASSWORD).",
    )
    @click.option(
        "--if-configured",
        is_flag=True,
        default=False,
        help="Skip cleanly when SEED_ADMIN_PASSWORD is not configured.",
    )
    def ensure_admin(email, password, if_configured):
        """Create or update an admin account from flags or SEED_ADMIN_* env vars."""
        try:
            result = ensure_admin_user(email=email, password=password)
        except ValueError as exc:
            raise click.ClickException(str(exc)) from exc

        if result["action"] == "skipped":
            if if_configured:
                click.echo("Admin sync skipped: SEED_ADMIN_PASSWORD is not set.")
                return
            raise click.ClickException("Admin password is required via --password or SEED_ADMIN_PASSWORD.")

        click.echo(f"Admin {result['action']}: {result['email']}.")
