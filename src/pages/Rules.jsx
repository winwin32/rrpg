import MarkdownPage from "../components/MarkdownPage";

// Automatically load every .md file
// in assets/rules

const ruleFiles = import.meta.glob(
    "../assets/rules/**/*.md",
    {
        eager: true,
        query: "?raw",
        import: "default"
    }
);

const ruleImages = Object.fromEntries(
    Object.entries(
        import.meta.glob("../assets/rules/*.{png,jpg,jpeg,gif,webp}", {
            eager: true,
            query: "?url",
            import: "default"
        })
    ).map(([path, url]) => [path.split("/").pop(), url])
);

function Rules() {
    return (
        <MarkdownPage
            title="Rules"
            files={ruleFiles}
            images={ruleImages}
        />
    );
}

export default Rules;