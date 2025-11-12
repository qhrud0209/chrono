"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function Page() {
  const { keyword_id } = useParams<{ keyword_id: string }>();
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!keyword_id) return;
    fetch(`/testapi/events/${keyword_id}`)
      .then(r => r.json())
      .then(d => setEvents(Array.isArray(d) ? d : d.content ?? []))
      .catch(console.error);
  }, [keyword_id]);

  return (
    <div style={{ padding: 16 }}>
      <h1>keyword_id: {String(keyword_id)}</h1>
      {events.map((e, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <b>{e.name}</b> <small>#{e.tag}</small>
          <div>{e.eventDateTime ?? e.datetime}</div>
          <div>{e.summary}</div>
          <hr />
        </div>
      ))}
      {events.length === 0 && <p>데이터가 없습니다.</p>}
    </div>
  );
}
