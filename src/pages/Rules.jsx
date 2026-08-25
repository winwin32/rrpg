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

const preferredRuleOrder = [
    "Core Rules.md",
    "Character Creation.md",
    "Extended Rules.md"
];

const orderedRuleFiles = Object.fromEntries([
    ...preferredRuleOrder.flatMap(filename =>
        Object.entries(ruleFiles).filter(([path]) =>
            path.endsWith(`/${filename}`)
        )
    ),
    ...Object.entries(ruleFiles).filter(([path]) =>
        !preferredRuleOrder.some(filename =>
            path.endsWith(`/${filename}`)
        )
    )
]);

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
            files={orderedRuleFiles}
            images={ruleImages}
        />
    );
}

export default Rules;