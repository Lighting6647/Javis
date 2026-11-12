import { useEffect, useRef } from "react";
import { renderSearchSuggestions } from "../services/searchSuggestions";

interface SearchSuggestionsProps {
  /** แถบคำค้นที่เกี่ยวข้องของ Google แต่ละแถบเป็น HTML สำเร็จรูปจาก Google */
  blocks: string[];
}

function SuggestionBlock({ html }: { html: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    renderSearchSuggestions(host.shadowRoot ?? host.attachShadow({ mode: "open" }), html);
  }, [html]);

  return <div ref={hostRef} className="search-suggestions-block" />;
}

/**
 * แถบคำค้นที่เกี่ยวข้องของ Google ใต้คำตอบที่ได้จากการค้นด้วย Google
 * แสดงตามหน้าตาที่ Google ให้มา ตามเงื่อนไขการใช้ของบริการค้นของ Google
 */
export function SearchSuggestions({ blocks }: SearchSuggestionsProps) {
  return (
    <div className="search-suggestions" role="group" aria-label="คำค้นที่เกี่ยวข้องจาก Google">
      {blocks.map((html, index) => (
        <SuggestionBlock key={index} html={html} />
      ))}
    </div>
  );
}
