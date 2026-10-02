# Dropped

Decided against, with the reason, so an idea can come back if the reason
stops being true.

- **A server that scrapes and stores pages.** Datacenter IPs get blocked
  by the sites people most want to save, it can't see pages behind the
  reader's login, it makes the operator the one copying and hosting the
  pages (DMCA duties), and it sees every URL everyone saves. On-device
  fetching has none of these. A stateless worker for a desktop browser
  version is still possible (TODO.md).
- **Downloading videos.** Apple guideline 5.2.3 and Play's IP policy
  reject saving media from YouTube and similar sites. Videos are a
  thumbnail and a link.
- **React, Tailwind and shadcn/ui.** Considered from the design reference
  guide. The app is a library list, a reader and settings; a build step
  and a framework cost more than they give. The guide's principles (HIG,
  8-point grid, springs, WCAG AA) are kept in DESIGN.md.
- **Syncing saved pages through a GitHub repo, as LifeLog syncs its
  data.** Fine for a JSON index, wrong for megabytes of images, and asking
  other people for a GitHub token is a non-starter. v1 is per device with
  export and import. *Revived 2 Oct 2026:* Daniel wants it for his own
  devices; it's in TODO.md under Sync, with the image question open.
