import { useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";

function Tooltip({ term, content, variant = "" }) {
    const [popupPosition, setPopupPosition] = useState(null);

    function showTooltip(event) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const showBelow = bounds.top < 160;

        setPopupPosition({
            left: bounds.left + bounds.width / 2,
            top: showBelow ? bounds.bottom + 10 : bounds.top - 10,
            showBelow
        });
    }

    return (
        <span
            className={`tooltip-wrapper ${variant}`}
            onMouseEnter={showTooltip}
            onMouseLeave={() => setPopupPosition(null)}
        >

            <span className="tooltip-term">
                {term}
            </span>

            {popupPosition && createPortal(
                <span
                    className={`tooltip-popup tooltip-popup-visible ${variant}`}
                    style={{
                        left: `${popupPosition.left}px`,
                        top: `${popupPosition.top}px`,
                        transform: popupPosition.showBelow
                            ? "translateX(-50%)"
                            : "translate(-50%, -100%)"
                    }}
                >

                    <ReactMarkdown>
                        {content}
                    </ReactMarkdown>

                </span>,
                document.body
            )}

        </span>
    );
}

export default Tooltip;