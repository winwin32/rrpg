import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";

function Tooltip({ term, content, variant = "" }) {
    const [popupPosition, setPopupPosition] = useState(null);
    const popupRef = useRef(null);

    function showTooltip(event) {
        const bounds = event.currentTarget.getBoundingClientRect();

        setPopupPosition({
            left: bounds.left + bounds.width / 2,
            top: bounds.top - 10,
            anchorTop: bounds.top,
            anchorBottom: bounds.bottom,
            showBelow: false
        });
    }

    useLayoutEffect(() => {
        if (!popupPosition || !popupRef.current) {
            return;
        }

        const popupBounds = popupRef.current.getBoundingClientRect();
        const margin = 12;
        const fitsAbove =
            popupPosition.anchorTop - popupBounds.height - 10 >= margin;
        const showBelow = !fitsAbove;
        const top = showBelow
            ? popupPosition.anchorBottom + 10
            : popupPosition.anchorTop - 10;
        const left = Math.min(
            Math.max(
                popupPosition.left,
                margin + popupBounds.width / 2
            ),
            window.innerWidth - margin - popupBounds.width / 2
        );

        if (
            left !== popupPosition.left ||
            top !== popupPosition.top ||
            showBelow !== popupPosition.showBelow
        ) {
            setPopupPosition({
                ...popupPosition,
                left,
                top,
                showBelow
            });
        }
    }, [popupPosition]);

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
                    ref={popupRef}
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