"""add_unique_constraint_job_id_slurm_snapshots

Revision ID: 89c90f8d419f
Revises: ad5af301f7df
Create Date: 2025-06-08 08:51:03.990842

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "89c90f8d419f"
down_revision = "ad5af301f7df"
branch_labels = None
depends_on = None


def upgrade():
    # First, remove any duplicate job_id entries that might exist
    # Keep only the most recent entry for each job_id
    op.execute("""
        DELETE FROM slurm_job_snapshots
        WHERE id NOT IN (
            SELECT DISTINCT ON (job_id) id
            FROM slurm_job_snapshots
            ORDER BY job_id, last_updated DESC NULLS LAST, id DESC
        )
    """)

    # Make job_id NOT NULL first (set to empty string if null)
    op.execute("UPDATE slurm_job_snapshots SET job_id = '' WHERE job_id IS NULL")
    op.alter_column("slurm_job_snapshots", "job_id", nullable=False)

    # Now add the unique constraint
    op.create_unique_constraint(
        "uq_slurm_job_snapshots_job_id", "slurm_job_snapshots", ["job_id"]
    )


def downgrade():
    # Remove the unique constraint
    op.drop_constraint(
        "uq_slurm_job_snapshots_job_id", "slurm_job_snapshots", type_="unique"
    )

    # Make job_id nullable again
    op.alter_column("slurm_job_snapshots", "job_id", nullable=True)
