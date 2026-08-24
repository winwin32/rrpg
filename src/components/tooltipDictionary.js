const tooltipFiles = import.meta.glob(
    "../assets/tooltips/**/*.md",
    {
        eager: true,
        query: "?raw",
        import: "default"
    }
);

const tooltipDictionary = {};

Object.entries(tooltipFiles).forEach(
    ([path, markdown]) => {

        const filename = path
            .split("/")
            .pop()
            .replace(/\.md$/, "");

        tooltipDictionary[
            filename.toLowerCase()
        ] = markdown;
    }
);

export default tooltipDictionary;