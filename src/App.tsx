import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Highlight,
  PdfHighlighter,
  PdfLoader,
  Popup,
  Tip,
} from "react-pdf-highlighter";
import type {
  IHighlight,
  NewHighlight,
  ScaledPosition,
} from "react-pdf-highlighter";
import { getDocument, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

import { Sidebar } from "./Sidebar";
import { Spinner } from "./Spinner";
import { testHighlights as _testHighlights } from "./test-highlights";

import "./style/App.css";
import "../dist/style.css";

const testHighlights: Record<string, Array<IHighlight>> = _testHighlights;

const getNextId = () => String(Math.random()).slice(2);
const parseIdFromHash = () => document.location.hash.slice("#highlight-".length);
const resetHash = () => (document.location.hash = "");

const HighlightPopup = ({
  comment,
}: {
  comment: { text: string; emoji: string };
}) => (comment.text ? (
  <div className="Highlight__popup">
    {comment.emoji} {comment.text}
  </div>
) : null);

const PRIMARY_PDF_URL = "https://arxiv.org/pdf/1708.08021";
const SECONDARY_PDF_URL = "https://arxiv.org/pdf/1604.02480";

const highlightWords = async (
  url: string,
  words: string[],
  setHighlights: React.Dispatch<React.SetStateAction<Array<IHighlight>>>
) => {
  try {
    const pdfDocument = await getDocument(url).promise;
    const highlightsToAdd: IHighlight[] = [];

    const findWordPositions = async (searchWord: string) => {
      const positions: ScaledPosition[] = [];
    
      // Escape special regex characters in the search word
      const escapedWord = searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedWord}\\b`, "g"); // Case-sensitive, whole-word match
    
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
    
        textContent.items.forEach((item) => {
          const itemText = (item as any).str;
          let match;
    
          while ((match = regex.exec(itemText)) !== null) {
            const startIndex = match.index;
            const endIndex = regex.lastIndex;
            const textWidth = (item as any).width;
            const charWidth = textWidth / itemText.length;
    
            // Calculate the position of the matched word
            const x = item.transform[4] + startIndex * charWidth;
            const y = viewport.height - item.transform[5];
            const width = (endIndex - startIndex) * charWidth;
            const height = (item as any).height;
    
            // Push the position data to the positions array
            positions.push({
              pageNumber: pageNum,
              boundingRect: {
                x1: x,
                y1: y - height,
                x2: x + width,
                y2: y,
                width: viewport.width,
                height: viewport.height,
              },
              rects: [{
                x1: x,
                y1: y - height,
                x2: x + width,
                y2: y,
                width: width,
                height: height,
              }],
            });
          }
        });
      }
    
      console.log(positions);
      return positions;
    };

    for (const word of words) {
      const positions = await findWordPositions(word);
      highlightsToAdd.push(...positions.map(position => ({
        id: getNextId(),
        position,
        content: { text: word },
        comment: {
          text: `Automatically highlighted: ${word}`,
          emoji: "🔍"
        }
      })));
    }

    setHighlights(prev => [...prev, ...highlightsToAdd]);
  } catch (error) {
    console.error("Error highlighting words:", error);
  }
};

export function App() {
  const [url, setUrl] = useState(new URLSearchParams(document.location.search).get("url") || PRIMARY_PDF_URL);
  const [highlights, setHighlights] = useState<Array<IHighlight>>(
    testHighlights[url] ? [...testHighlights[url]] : []
  );

  const scrollViewerTo = useRef<(highlight: IHighlight) => void>(() => {});

  // Highlight initialization
  useEffect(() => {
    const wordsToHighlight = ["In"];
    highlightWords(url, wordsToHighlight, setHighlights);
  }, [url]);

  // Document handling
  const toggleDocument = () => {
    const newUrl = url === PRIMARY_PDF_URL ? SECONDARY_PDF_URL : PRIMARY_PDF_URL;
    setUrl(newUrl);
    setHighlights(testHighlights[newUrl] ? [...testHighlights[newUrl]] : []);
  };

  // Highlight interactions
  const addHighlight = (highlight: NewHighlight) => {
    setHighlights(prev => [{ ...highlight, id: getNextId() }, ...prev]);
  };

  // Scrolling and hash handling
  const scrollToHighlightFromHash = useCallback(() => {
    const highlight = highlights.find(h => h.id === parseIdFromHash());
    if (highlight) scrollViewerTo.current(highlight);
  }, [highlights]);

  useEffect(() => {
    window.addEventListener("hashchange", scrollToHighlightFromHash);
    return () => window.removeEventListener("hashchange", scrollToHighlightFromHash);
  }, [scrollToHighlightFromHash]);

  return (
    <div className="App" style={{ display: "flex", height: "100vh" }}>
      <Sidebar
        highlights={highlights}
        resetHighlights={() => setHighlights([])}
        toggleDocument={toggleDocument}
      />
      <div style={{ height: "100vh", width: "75vw", position: "relative" }}>
        <PdfLoader url={url} beforeLoad={<Spinner />}>
          {(pdfDocument) => (
            <PdfHighlighter
              pdfDocument={pdfDocument}
              enableAreaSelection={(event) => event.altKey}
              onScrollChange={resetHash}
              scrollRef={(scrollTo) => {
                scrollViewerTo.current = scrollTo;
                scrollToHighlightFromHash();
              }}
              onSelectionFinished={(position, content, hideTip, transformSelection) => (
                <Tip
                  onOpen={transformSelection}
                  onConfirm={(comment) => {
                    addHighlight({ content, position, comment });
                    hideTip();
                  }}
                />
              )}
              highlightTransform={(highlight, index, setTip, hideTip, _, __, isScrolledTo) => {
                const isAutoHighlight = highlight.comment?.text.startsWith("Automatically highlighted:");
                
                return (
                  <Popup
                    popupContent={<HighlightPopup {...highlight} />}
                    onMouseOver={() => setTip(highlight, () => <HighlightPopup {...highlight} />)}
                    onMouseOut={hideTip}
                    key={index}
                  >
                    <div style={{
                      backgroundColor: isAutoHighlight ? "rgba(255, 255, 0, 0.6)" : "rgba(173, 216, 230, 0.9)",
                      borderRadius: "2px",
                      transition: "background-color 0.2s"
                    }}>
                      <Highlight
                        isScrolledTo={isScrolledTo}
                        position={highlight.position}
                        comment={highlight.comment}
                      />
                    </div>
                  </Popup>
                );
              }}
              highlights={highlights}
            />
          )}
        </PdfLoader>
      </div>
    </div>
  );
}