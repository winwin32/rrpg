import {
    Children,
    cloneElement,
    Fragment,
    isValidElement,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import tooltipDictionary
    from "./tooltipDictionary";

import Tooltip from "./Tooltip";

function renderDictionaryTooltipText(text) {

    const terms =
        Object.keys(
            tooltipDictionary
        ).sort(
            (firstTerm, secondTerm) =>
                secondTerm.length - firstTerm.length
        );

    if (terms.length === 0) {
        return text;
    }

    const regex =
        new RegExp(
            `\\b(${terms
                .map(term =>
                    term.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&"
                    )
                )
                .join("|")})\\b`,
            "gi"
        );

    const parts =
        text.split(regex);

    return parts.map(
        (part, index) => {

            const key =
                part.toLowerCase();

            const tooltip =
                tooltipDictionary[key];

            if (!tooltip) {
                return (
                    <Fragment
                        key={index}
                    >
                        {part}
                    </Fragment>
                );
            }

            return (
                <Tooltip
                    key={index}
                    term={part}
                    content={tooltip}
                />
            );
        }
    );
}

function renderTooltipText(text) {
    const discretionTooltip =
        tooltipDictionary["game master's discretion"];

    return text
        .split(/(==[^=\n]+==)/g)
        .map((part, index) => {
            if (
                part.startsWith("==") &&
                part.endsWith("==") &&
                discretionTooltip
            ) {
                return (
                    <Tooltip
                        key={index}
                        term={part.slice(2, -2)}
                        content={discretionTooltip}
                        variant="tooltip-gm-discretion"
                    />
                );
            }

            return (
                <Fragment key={index}>
                    {renderDictionaryTooltipText(part)}
                </Fragment>
            );
        });
}

function renderTooltipChildren(children) {
    return Children.map(
        children,
        child => {
            if (typeof child === "string") {
                return renderTooltipText(child);
            }

            if (isValidElement(child) && child.props.children) {
                return cloneElement(
                    child,
                    {},
                    renderTooltipChildren(child.props.children)
                );
            }

            return child;
        }
    );
}

function getHeadings(markdown) {
    return Array.from(
        markdown.matchAll(/^(#)\s+(.+?)\s*$/gm)
    ).map((match, index) => ({
        id: `markdown-heading-${index}`,
        level: match[1].length,
        text: match[2]
            .replace(/\*\*|__|[*_`~]/g, "")
            .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
            .trim()
    }));
}

function MarkdownPage({ files, images = {}, title }) {
    const entries = Object.entries(files);
    const markdownContentRef = useRef(null);

    const [selectedFile, setSelectedFile] = useState(
        entries[0]?.[0] || null
    );

    const selectedModule =
        selectedFile
            ? files[selectedFile]
            : null;

    const selectedHeadings = useMemo(
        () => selectedModule
            ? getHeadings(selectedModule)
            : [],
        [selectedModule]
    );

    const [selectedHeading, setSelectedHeading] = useState(null);
    const [isFileListOpen, setIsFileListOpen] = useState(false);

    function selectFile(path, headingId = null) {
        setSelectedFile(path);
        setSelectedHeading(headingId);
        setIsFileListOpen(false);
    }

    useEffect(() => {
        if (!markdownContentRef.current) {
            return;
        }

        if (!selectedHeading) {
            markdownContentRef.current.scrollTop = 0;
            return;
        }

        const heading = markdownContentRef.current.querySelector(
            `#${selectedHeading}`
        );

        heading?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }, [selectedFile, selectedHeading]);

    return (
        <div className="markdown-page">
            <button
                className="markdown-file-toggle"
                aria-expanded={isFileListOpen}
                aria-controls="markdown-file-list"
                onClick={() => setIsFileListOpen(true)}
            >
                More
            </button>

            {isFileListOpen && (
                <button
                    className="markdown-sidebar-backdrop"
                    aria-label="Close file list"
                    onClick={() => setIsFileListOpen(false)}
                />
            )}

            <aside
                id="markdown-file-list"
                className={
                    isFileListOpen
                        ? "markdown-sidebar mobile-open"
                        : "markdown-sidebar"
                }
            >
                <h2>{title}</h2>

                <button
                    className="markdown-file-close"
                    aria-label="Close file list"
                    onClick={() => setIsFileListOpen(false)}
                >
                    Close
                </button>

                {entries.map(([path, markdown]) => {
                    const filename =
                        path
                            .split("/")
                            .pop()
                            .replace(/\.md$/, "");
                    const headings = getHeadings(markdown);

                    return (
                        <div key={path} className="markdown-file-group">
                            <button
                                className={
                                    path === selectedFile
                                        ? "markdown-file active"
                                        : "markdown-file"
                                }
                                onClick={() => selectFile(path)}
                            >
                                {filename}
                            </button>

                            <div className="markdown-outline">
                                {headings.map(heading => (
                                    <button
                                        className="markdown-heading-link"
                                        style={{
                                            paddingLeft: `${8 + heading.level * 10}px`
                                        }}
                                        key={heading.id}
                                        onClick={() =>
                                            selectFile(path, heading.id)
                                        }
                                    >
                                        {heading.text}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </aside>

            <article ref={markdownContentRef} className="markdown-content">
                {selectedModule ? (
                    (() => {
                        let headingIndex = 0;

                        const renderHeading = ({ children }) => {
                            const heading = selectedHeadings[headingIndex++];
                            const Heading = `h${heading?.level || 1}`;

                            return (
                                <Heading id={heading?.id}>
                                    {renderTooltipChildren(children)}
                                </Heading>
                            );
                        };

                        return (
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            img: ({ src, alt }) => {
                                const imageName = src?.split("/").pop();
                                const imageSource = imageName
                                    ? images[imageName]
                                    : null;

                                return imageSource ? (
                                    <img src={imageSource} alt={alt || ""} />
                                ) : null;
                            },
                            p: ({ children }) => (
                                <p>{renderTooltipChildren(children)}</p>
                            ),
                            li: ({ children }) => (
                                <li>{renderTooltipChildren(children)}</li>
                            ),
                            strong: ({ children }) => (
                                <strong>
                                    {renderTooltipChildren(children)}
                                </strong>
                            ),
                            em: ({ children }) => (
                                <em>{renderTooltipChildren(children)}</em>
                            ),
                            h1: renderHeading
                        }}
                        
                    >
                        {selectedModule}
                    </ReactMarkdown>
                        );
                    })()
                ) : (
                    <p>No Markdown files found.</p>
                )}
            </article>
        </div>
    );
}

export default MarkdownPage;