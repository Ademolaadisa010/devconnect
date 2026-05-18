// app/api/reddit/route.ts

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const subreddit = searchParams.get("subreddit") || "technology";
  const limit = searchParams.get("limit") || "6";
  const sort = searchParams.get("sort") || "top";

  try {
    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 DevConnect/1.0",
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { posts: [], error: `Reddit responded with ${res.status}` },
        { status: 200 }
      );
    }

    const json = await res.json();

    const posts = (json?.data?.children || []).map((item: any) => {
      const d = item.data;
      return {
        id: d.id,
        title: d.title,
        content: d.selftext || "",
        url: `https://reddit.com${d.permalink}`,
        image: d.thumbnail?.startsWith("http") ? d.thumbnail : null,
        author: d.author,
        subreddit: d.subreddit,
        score: d.score,
        numComments: d.num_comments,
        createdAt: d.created_utc,
      };
    });

    return NextResponse.json({ posts });
  } catch (err: any) {
    console.error("[reddit proxy] error:", err);
    return NextResponse.json({ posts: [], error: err.message }, { status: 200 });
  }
}