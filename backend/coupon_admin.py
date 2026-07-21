"""Local-only seller commands for issuing and revoking membership coupons."""

import argparse
from typing import Optional

import membership


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage locally stored membership coupons")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create", help="Create single-use coupons")
    create.add_argument("--plan", choices=("pro",), default="pro")
    create.add_argument("--type", choices=("weekly", "monthly", "yearly"), required=True)
    create.add_argument("--count", type=int, default=1)
    create.add_argument("--note", default="")
    create.add_argument("--expires-days", type=int, default=0)

    listing = subparsers.add_parser("list", help="List coupon status")
    listing.add_argument("--status", choices=("all", "active", "used", "revoked", "expired"), default="all")

    revoke = subparsers.add_parser("revoke", help="Revoke one unused active coupon")
    revoke.add_argument("code")
    return parser


def _list_coupons(status: str) -> list[str]:
    query = """
        SELECT code, plan, order_type, status, redeemed_by, redeemed_at, expires_at, note
        FROM coupon_codes
    """
    params: tuple[str, ...] = ()
    if status != "all":
        query += " WHERE status=?"
        params = (status,)
    query += " ORDER BY created_at DESC, code ASC"

    with membership._get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [
        "{code} {status} plan={plan} type={order_type} redeemed_by={redeemed_by} "
        "redeemed_at={redeemed_at} expires_at={expires_at} note={note}".format(
            code=row["code"],
            status=row["status"],
            plan=row["plan"],
            order_type=row["order_type"],
            redeemed_by=row["redeemed_by"] or "-",
            redeemed_at=row["redeemed_at"] or "-",
            expires_at=row["expires_at"] or "-",
            note=row["note"] or "-",
        )
        for row in rows
    ]


def _revoke_coupon(code: str) -> list[str]:
    normalized_code = membership._normalize_coupon_code(code)
    with membership._get_db() as conn:
        cur = conn.execute(
            """UPDATE coupon_codes
               SET status='revoked'
               WHERE code=? AND status='active' AND redeemed_count=0""",
            (normalized_code,),
        )
    if cur.rowcount != 1:
        raise ValueError("Coupon is not an unused active code")
    return [f"{normalized_code} revoked"]


def run_cli(argv: Optional[list[str]] = None) -> list[str]:
    args = build_parser().parse_args(argv)
    membership.init_membership_db()

    if args.command == "create":
        if args.count < 1 or args.count > 500:
            raise ValueError("count must be between 1 and 500")
        if args.expires_days < 0:
            raise ValueError("expires-days cannot be negative")
        return [
            membership.create_membership_coupon(
                args.plan,
                order_type=args.type,
                note=args.note,
                expires_days=args.expires_days,
            )
            for _ in range(args.count)
        ]
    if args.command == "list":
        return _list_coupons(args.status)
    if args.command == "revoke":
        return _revoke_coupon(args.code)
    raise ValueError("Unknown command")


def main() -> None:
    for line in run_cli():
        print(line)


if __name__ == "__main__":
    main()
