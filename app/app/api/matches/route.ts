import { NextResponse } from "next/server";
import {
  getApiFootballCachedFailure,
  getApiFootballMatches,
} from "@/lib/apiFootball";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const matches = await getApiFootballMatches();
    return NextResponse.json({
      source: "api-football",
      matches,
      error: getApiFootballCachedFailure(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        source: "api-football",
        matches: [],
        error: error?.message || "Failed to load football fixtures.",
      },
      { status: 200 }
    );
  }
}
