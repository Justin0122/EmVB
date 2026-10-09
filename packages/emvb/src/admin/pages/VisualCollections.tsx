import { Banner, Button, Loader, Table } from "@cloudflare/kumo";
import * as React from "react";
import type { Fetcher } from "../api.ts";
import { editorUrl } from "../editor/exit.ts";
import {
  enableVisualEditing,
  listEntries,
  listVisualCollections,
  type CollectionSummary,
} from "../setup/visual-collections.ts";
import { BUTTON } from "../ui.ts";
import {
  EditedTime,
  ListError,
  ListSearch,
  matchesSearch,
  NoMatches,
  StatusBadge,
  useList,
} from "./list-kit.tsx";

type Collections =
  | { state: "loading" }
  | { state: "ready"; visual: CollectionSummary[]; available: CollectionSummary[] }
  | { state: "error"; message: string };

/**
 * W-307: the site's collections that are edited visually, each with its entries, and the
 * collections "Edit visually" can still be turned on for. Every entry has its own layout.
 */
export function VisualCollections({ fetcher }: { fetcher: Fetcher }) {
  const [collections, setCollections] = React.useState<Collections>({ state: "loading" });
  const [reload, setReload] = React.useState(0);
  const [turningOn, setTurningOn] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    listVisualCollections(fetcher).then(
      (found) => active && setCollections({ state: "ready", ...found }),
      (error: unknown) =>
        active &&
        setCollections({
          state: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
    );
    return () => {
      active = false;
    };
  }, [fetcher, reload]);

  const turnOn = async (collection: CollectionSummary) => {
    setTurningOn(collection.slug);
    setProblem(null);
    try {
      await enableVisualEditing(fetcher, collection.slug);
      setReload((n) => n + 1);
    } catch (error) {
      setProblem(
        `Couldn't turn on visual editing for ${collection.label}. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setTurningOn(null);
    }
  };

  if (collections.state === "loading") return null;
  if (collections.state === "error") {
    return <ListError title="Couldn't load your collections" message={collections.message} />;
  }
  return (
    <div className="emvb-visual-collections" data-emvb-visual-collections="">
      {collections.visual.map((collection) => (
        <CollectionEntries key={collection.slug} fetcher={fetcher} collection={collection} />
      ))}
      {collections.available.length > 0 && (
        <section
          className="emvb-surface-card emvb-collection-offer"
          aria-labelledby="emvb-edit-visually"
        >
          <h2 id="emvb-edit-visually" className="emvb-section-title">
            Edit a collection visually
          </h2>
          <p className="emvb-muted">
            Give every entry of a collection its own layout in this editor. Its other fields stay in
            the normal editor. Turning it on adds a Visual layout field and keeps all content.
          </p>
          {problem && <Banner variant="error" title={problem} />}
          <ul className="emvb-collection-offer-list">
            {collections.available.map((collection) => (
              <li key={collection.slug} data-emvb-offer={collection.slug}>
                <span>{collection.label}</span>
                <Button
                  variant="secondary"
                  className={BUTTON}
                  loading={turningOn === collection.slug}
                  disabled={turningOn !== null}
                  onClick={() => void turnOn(collection)}
                >
                  Edit visually
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CollectionEntries({
  fetcher,
  collection,
}: {
  fetcher: Fetcher;
  collection: CollectionSummary;
}) {
  const load = React.useCallback(
    (f: Fetcher) => listEntries(f, collection.slug),
    [collection.slug],
  );
  const list = useList(fetcher, load);
  const [query, setQuery] = React.useState("");
  const shown =
    list.state === "ready"
      ? list.items.filter((entry) => matchesSearch(query, entry.title, entry.slug))
      : [];
  const headingId = `emvb-collection-${collection.slug}`;
  return (
    <section aria-labelledby={headingId} data-emvb-collection-list={collection.slug}>
      <h2 id={headingId} className="emvb-section-title">
        {collection.label}
      </h2>
      {list.state === "loading" && <Loader />}
      {list.state === "error" && (
        <ListError title={`Couldn't load ${collection.label}`} message={list.message} />
      )}
      {list.state === "ready" && list.items.length === 0 && (
        <p className="emvb-muted">
          No {collection.label.toLocaleLowerCase()} yet. Create entries in the normal editor.
        </p>
      )}
      {list.state === "ready" && list.items.length > 0 && (
        <ListSearch value={query} onChange={setQuery} label={`Search ${collection.label}`} />
      )}
      {list.state === "ready" && list.items.length > 0 && shown.length === 0 && (
        <NoMatches query={query} />
      )}
      {list.state === "ready" && shown.length > 0 && (
        <div className="emvb-surface-card">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Title</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Last edited</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {shown.map((entry) => (
                <Table.Row key={entry.id} data-emvb-row={entry.id}>
                  <Table.Cell>
                    <a className="emvb-row-title" href={editorUrl(entry.id, collection.slug)}>
                      {entry.title}
                    </a>
                    <div className="emvb-row-slug">{entry.slug}</div>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge status={entry.status} />
                  </Table.Cell>
                  <Table.Cell>
                    <EditedTime iso={entry.updatedAt} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </section>
  );
}
