import argparse

from membership import create_membership_coupon, init_membership_db


def main():
    parser = argparse.ArgumentParser(description="Generate membership coupon codes.")
    parser.add_argument("--plan", choices=["pro", "ultra"], required=True)
    parser.add_argument(
        "--type",
        dest="order_type",
        choices=["monthly", "yearly", "lifetime"],
        default="monthly",
    )
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--expires-days", type=int, default=0)
    parser.add_argument("--max-redemptions", type=int, default=1)
    parser.add_argument("--note", default="")
    parser.add_argument("--code", default="", help="Optional custom code; only valid when count=1.")
    args = parser.parse_args()

    if args.code and args.count != 1:
        raise SystemExit("--code can only be used with --count 1")

    init_membership_db()
    for _ in range(max(1, args.count)):
        code = create_membership_coupon(
            plan=args.plan,
            order_type=args.order_type,
            code=args.code,
            expires_days=args.expires_days,
            note=args.note,
            max_redemptions=args.max_redemptions,
        )
        print(code)


if __name__ == "__main__":
    main()
