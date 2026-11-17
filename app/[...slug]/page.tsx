import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { DetailPage } from "@/components/detail-page";
import {
  permanentPublicRedirectTarget,
  type PublicSearchParams,
  withSearchParams,
} from "@/lib/public-navigation";
import { chainDirectory, getPageData } from "@/lib/site-data";

type RouteProps = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<PublicSearchParams>;
};

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPageData(slug.join("/"));
  if (!page) return {};
  const isProposedProductPlane =
    page.path.startsWith("products/") || page.path.startsWith("solutions/");
  const title = isProposedProductPlane
    ? `${page.eyebrow} (Proposed)`
    : page.eyebrow;
  const description = isProposedProductPlane
    ? `${page.intro} Prelaunch architecture; blockchain infrastructure is not generally available.`
    : page.intro;

  return {
    title,
    description,
    alternates: {
      canonical: `/${page.path}`,
    },
    openGraph: {
      title: `${title} | Nodezuno`,
      description,
      url: `/${page.path}`,
    },
    twitter: {
      title: `${title} | Nodezuno`,
      description,
    },
  };
}

export default async function CatchAllPage({ params, searchParams }: RouteProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const path = slug.join("/");
  const permanentTarget = permanentPublicRedirectTarget(path);
  if (permanentTarget) {
    permanentRedirect(withSearchParams(permanentTarget, query));
  }

  const page = getPageData(path);
  if (!page) notFound();
  if (page.path !== path) {
    permanentRedirect(withSearchParams(`/${page.path}`, query));
  }

  return <DetailPage initialChains={page.kind === "directory" ? chainDirectory : []} page={page} />;
}
