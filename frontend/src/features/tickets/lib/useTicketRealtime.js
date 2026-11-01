import { useEffect, useRef, useState } from "react";
import { pb } from "../../../lib/pocketbase";

// Berlangganan perubahan tiket, komentar, dan lampiran lewat SSE PocketBase.
// Callback hanya memberi sinyal "ada perubahan"; pemanggil yang memutuskan
// apakah perlu memuat ulang data (dengan expand dan aturan visibilitas).
export default function useTicketRealtime(ticketId, onEvent) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!ticketId) return undefined;

    let disposed = false;
    const unsubscribeFns = [];
    const notify = (event, kind) => {
      if (handlerRef.current) handlerRef.current(event, kind);
    };

    const subscriptions = [
      pb
        .collection("tickets")
        .subscribe(ticketId, (event) => notify(event, "ticket")),
      pb.collection("ticket_comments").subscribe(
        "*",
        (event) => notify(event, "comment"),
        { filter: `ticket = "${ticketId}"` }
      ),
      pb.collection("ticket_attachments").subscribe(
        "*",
        (event) => notify(event, "attachment"),
        { filter: `ticket = "${ticketId}"` }
      ),
      pb.collection("ticket_approvals").subscribe(
        "*",
        (event) => notify(event, "approval"),
        { filter: `ticket = "${ticketId}"` }
      ),
    ];

    Promise.all(subscriptions)
      .then((fns) => {
        if (disposed) {
          fns.forEach((fn) => Promise.resolve(fn()).catch(() => {}));
          return;
        }
        unsubscribeFns.push(...fns);
        setConnected(true);
      })
      .catch(() => {
        if (!disposed) setConnected(false);
      });

    return () => {
      disposed = true;
      setConnected(false);
      unsubscribeFns.forEach((fn) => {
        Promise.resolve(fn()).catch(() => {});
      });
    };
  }, [ticketId]);

  return connected;
}
