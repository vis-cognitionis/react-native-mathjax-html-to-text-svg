import React, { memo } from "react";
import { ScrollView, Text, TouchableWithoutFeedback, View } from "react-native";
import { SvgFromXml } from "react-native-svg";

import { decode } from "html-entities";
import { cssStringToRNStyle } from "./HTMLStyles";

const mathjax = require("./mathjax/mathjax").mathjax;
const TeX = require("./mathjax/input/tex").TeX;
const SVG = require("./mathjax/output/svg").SVG;
const liteAdaptor = require("./mathjax/adaptors/liteAdaptor").liteAdaptor;
const RegisterHTMLHandler =
  require("./mathjax/handlers/html").RegisterHTMLHandler;

const AllPackages = require("./mathjax/input/tex/AllPackages").AllPackages;

const packageList = AllPackages.sort()
  .join(", ")
  .split(/\s*,\s*/);

require("./mathjax/util/entities/all.js");

const adaptor = liteAdaptor();

RegisterHTMLHandler(adaptor);

const tagToStyle = {
  u: { textDecorationLine: "underline" },
  ins: { textDecorationLine: "underline" },
  s: { textDecorationLine: "line-through" },
  del: { textDecorationLine: "line-through" },
  b: { fontWeight: "bold" },
  strong: { fontWeight: "bold" },
  i: { fontStyle: "italic" },
  cite: { fontStyle: "italic" },
  dfn: { fontStyle: "italic" },
  em: { fontStyle: "italic" },
  mark: { backgroundColor: "yellow" },
  small: { fontSize: 8 },
};

const getScale = (_svgString) => {
  const svgString = _svgString.match(/<svg([^\>]+)>/gi).join("");

  let [width, height] = (svgString || "")
    .replace(
      /.* width=\"([\d\.]*)[ep]x\".*height=\"([\d\.]*)[ep]x\".*/gi,
      "$1,$2"
    )
    .split(/\,/gi);
  [width, height] = [parseFloat(width), parseFloat(height)];

  return [width, height];
};

const applyScale = (svgString, [width, height]) => {
  let retSvgString = svgString.replace(
    /(<svg[^\>]+height=\")([\d\.]+)([ep]x\"[^\>]+>)/gi,
    `$1${height}$3`
  );

  retSvgString = retSvgString.replace(
    /(<svg[^\>]+width=\")([\d\.]+)([ep]x\"[^\>]+>)/gi,
    `$1${width}$3`
  );

  retSvgString = retSvgString.replace(
    /(<svg[^\>]+width=\")([0]+[ep]?x?)(\"[^\>]+>)/gi,
    "$10$3"
  );
  retSvgString = retSvgString.replace(
    /(<svg[^\>]+height=\")([0]+[ep]?x?)(\"[^\>]+>)/gi,
    "$10$3"
  );

  return retSvgString;
};

const applyColor = (svgString, fillColor) => {
  return svgString.replace(/currentColor/gim, `${fillColor}`);
};

const GenerateSvgComponent = ({ item, fontSize, color, setIsTabular }) => {
  let svgText = adaptor.innerHTML(item);

  const [width, height] = getScale(svgText);

  svgText = svgText.replace(/font-family=\"([^\"]*)\"/gim, "");
  svgText = svgText.replace(
    /<rect[^>]*data-frame="true"[^>]*>/g,
    '<rect fill="transparent" stroke="white" stroke-width="30">'
  );

  //to hide for tables
  svgText = svgText.replace(/<g[^>]*data-mml-node="merror"[^>]*>/g, "");
  // svgText = svgText.replace(/fill="([^\"]*)"/gim, fill=${color});

  svgText = svgText.replace(/\\llbracket/g, "⟦");
  svgText = svgText.replace(/\\rrbracket/g, "⟧");

  svgText = applyScale(svgText, [(width * fontSize) / 1.1, height * fontSize]);
  svgText = applyColor(svgText, color);

  const isTabular = svgText.includes("tabular");

  React.useEffect(() => {
    setIsTabular(isTabular);
  }, [isTabular]);

  return (
    <View
      style={{
        // borderColor: "blue",
        // borderWidth: 1,
        flexDirection: "row",
        alignSelf: "center",
      }}
    >
      <SvgFromXml xml={svgText} />
    </View>
  );
};
const GenerateTextComponent = ({
  fontSize,
  color,
  index,
  item,
  parentStyle = null,
  textStyle,
  scrollBorderColor,
  scrollIconColor,
}) => {
  let rnStyle = null;
  let text = null;
  const [isTabular, setIsTabular] = React.useState(false);

  if (
    item?.kind !== "#text" &&
    item?.kind !== "mjx-container" &&
    item?.kind !== "#comment"
  ) {
    let htmlStyle = adaptor.allStyles(item) || null;

    if (htmlStyle) {
      rnStyle = cssStringToRNStyle(htmlStyle);
    }

    rnStyle = { ...(tagToStyle[item?.kind] || null), ...rnStyle };
  }

  if (item?.kind === "#text" || item?.kind === "span") {
    text = decode(adaptor.value(item) || "");

    if (text.startsWith(".")) {
      const afterDot = text.substring(1).trim();

      if (afterDot !== "") {
        text = afterDot;
      }
    }

    rnStyle = parentStyle ? parentStyle : null;
  } else if (item?.kind === "br") {
    text = "\n\n";
    rnStyle = { width: "100%", overflow: "hidden", height: 0 };
  }

  const [boldTextRanges, setBoldTextRanges] = React.useState([]);

  React.useEffect(() => {
    const regex = /\*\*(.*?)\*\*/g;
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ start: match.index, end: regex.lastIndex });
    }
    setBoldTextRanges(matches);
  }, [text]);

  const checkNumberedListOrColon = () => {
    // Checks for headings starting with '#', followed by a space,
    // then an uppercase letter, optional punctuation, and ending with a colon and optional space.
    const pattern1 = /^\s*#+\s*[A-ZÇĞİÖŞÜ][^:'"]*:\s*$/m.test(text);

    // Checks for lines starting with optional whitespace, followed by a number,
    // then a dot or colon, and ending with optional whitespace.
    const pattern2 = /^\s*\d+(\.|:)\s*/m.test(text);

    // Checks for lines starting with optional whitespace,
    // followed by a letter, number, or Roman numeral, then a closing parenthesis, and ending with optional whitespace.
    const pattern3 = /^\s*([a-zA-Z0-9]+|[IVXLCDM]+)\)\s*/m.test(text);

    // Checks for lines starting with optional whitespace, followed by a hyphen or bullet point, and then one or more spaces.
    const pattern4 = /^\s*[-•]\s+/m.test(text);

    // Checks for lines ending with a period (dot).
    const pattern5 = /\.\s*$/m.test(text);

    // Checks for lines ending with punctuation.
    const pattern6 = /[,;]\s*$/m.test(text);

    // Checks for lines ending with a colon, but not single-word lines.
    const pattern7 = /^(?!\s*\b\w+\b\s*:\s*$).*:\s*$/m.test(text);

    // Checks for single characters or Roman numerals followed by a colon.
    const pattern8 = /^\s*([A-Z]|[IVXLCDM]+|\d+):\s*$/m.test(text);

    return (
      pattern1 ||
      pattern2 ||
      pattern3 ||
      pattern4 ||
      pattern5 ||
      pattern6 ||
      pattern7 ||
      pattern8
    );
  };

  const cleanText = text
    ?.split(/\r?\n/) // split the text into lines
    .filter((line) => line.trim() !== "") // remove empty lines
    .join("\n") // join the lines back together
    .replace(
      /(^|\n)(#+\s.*$)/gm,
      (match) => `@+\n${match.replace(/^#+\s/, "")}@+`
    ) // wrap headings with '@+' and '@+' and add a blank line before headings
    .replace(/^(#+\s.*$)/gm, (match) => `${match.replace(/^#+\s/, "")}`) // remove the '#' from headings
    .replace(/\\/g, "") // remove backslashes ('\')
    .replace(/\*\*(.*?)\*\*/g, (_, p1) => `@+${p1}@+`) // wrap bold text markers with '@+' and '@+'
    .replace(/\*\*/g, "") // remove ** markers
    .replace(/^\s*[\p{P}\p{S}]\s*$/gmu, "") // remove single punctuation marks that are alone on a line
    .replace(/^\s*[\p{P}\p{S}]\s*[\p{P}\p{S}]\s*$/gmu, "") // remove specific patterns like ): or ).

    // clean up table headers and separators
    .replace(/hline/g, "") // remove occurrences of 'hline'
    .replace(/end{tabular}/g, "") // remove occurrences of 'end{tabular}'
    .replace(/begin{tabular}/g, "") // remove occurrences of 'begin{tabular}'
    .replace(/(?:\|:?\s*[-:]+\s*)+\|?/g, "") // remove table headers and separators
    .replace(/^\s*\|\s*(?:[-:]+\s*)+\|?\s*$/gm, "") // remove table header rows
    .replace(/^\s*\|\s*(?:[^|]*\s*)+\|?\s*$/gm, "") // remove table data rows
    .replace(/^\s*\|\s*(?:\s*[-:]+\s*)+\|?\s*$/gm, "") // remove table separator rows
    .trim(); // trim leading and trailing whitespace

  const isNumberedListOrColon = checkNumberedListOrColon();

  const content = !!cleanText ? (
    <Text
      allowFontScaling={false}
      key={`sub-${index}`}
      style={[
        {
          textAlign: "left",
          textAlignVertical: "bottom",
          fontSize: fontSize * 2,
          display: cleanText?.trim() === "" ? "none" : "flex",
          height: "auto",
          width:
            cleanText.length > 34 || isNumberedListOrColon ? "100%" : "auto",
          display: "flex",
          flexGrow: 0,
          flexShrink: 1,
          flexBasis: "auto",
          flexWrap: "nowrap",
          marginBottom: -5,
        },
        textStyle,
      ]}
      textBreakStrategy="highQuality"
    >
      {cleanText.split("@+").map((chunk, i) => {
        if (i % 2 === 0) {
          return chunk;
        } else {
          return (
            <Text
              key={`bold-${i}`}
              style={{
                fontWeight: "700",
              }}
            >
              {chunk}
            </Text>
          );
        }
      })}
    </Text>
  ) : item?.kind === "mjx-container" ? (
    <GenerateSvgComponent
      key={`sub-${index}`}
      item={item}
      fontSize={fontSize}
      color={color}
      setIsTabular={setIsTabular}
    />
  ) : item.children?.length ? (
    item.children.map((subItem, subIndex) => (
      <GenerateTextComponent
        key={`sub-${index}-${subIndex}`}
        color={color}
        fontSize={fontSize}
        item={subItem}
        index={subIndex}
        parentStyle={rnStyle}
      />
    ))
  ) : null;

  const svgItemWidth =
    item &&
    item?.children !== undefined &&
    item.children[0].attributes?.width !== undefined
      ? Number(item?.children[0]?.attributes?.width.split("ex")[0])
      : 1;

  const checkWidth = Boolean(svgItemWidth > 40);

  const containerStyle = {
    height: "auto",
    display: text?.trim() === "" ? "none" : "flex",
    borderColor: "transparent",
    borderWidth: 1,
    flexDirection: "row",
  };

  const scrollContainerStyle = {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: scrollBorderColor,
    borderStyle: "dashed",
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    paddingVertical: 10,
    paddingRight: 10,
  };

  if (item?.kind === "mjx-container" && checkWidth) {
    return (
      <View style={{ flexDirection: "row", width: "100%" }}>
        <ScrollView
          horizontal={true}
          contentContainerStyle={[
            containerStyle,
            { display: isTabular ? "none" : "flex" },
          ]}
          scrollIndicatorInsets={{ top: 30 }}
          showsHorizontalScrollIndicator={false}
          persistentScrollbar={false}
        >
          <TouchableWithoutFeedback>
            <View style={scrollContainerStyle}>
              {checkWidth && (
                <Text
                  style={{
                    flexDirection: "row",
                    color: scrollIconColor,
                    paddingRight: 10,
                    alignSelf: "center",
                  }}
                >
                  {" "}
                  {">>"}
                </Text>
              )}
              {content}
            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </View>
    );
  } else {
    return <View style={containerStyle}>{content}</View>;
  }
};

const ConvertToComponent = ({
  texString = "",
  fontSize = 12,
  fontCache = false,
  color,
  textStyle,
  scrollBorderColor,
  scrollIconColor,
}) => {
  if (!texString) {
    return "";
  }

  const tex = new TeX({
    packages: packageList,
    inlineMath: [
      ["$", "$"],
      ["\\(", "\\)"],
    ],
    displayMath: [
      ["$$", "$$"],
      ["\\[", "\\]"],
    ],
    processEscapes: true,
  });

  const svg = new SVG({
    fontCache: fontCache ? "local" : "none",
    mtextInheritFont: true,
    merrorInheritFont: true,
  });

  const html = mathjax.document(texString, {
    InputJax: tex,
    OutputJax: svg,
    renderActions: { assistiveMml: [] },
  });

  html.render();

  if (Array.from(html.math).length === 0) {
    adaptor.remove(html.outputJax.svgStyles);
    const cache = adaptor.elementById(
      adaptor.body(html.document),
      "MJX-SVG-global-cache"
    );
    if (cache) adaptor.remove(cache);
  }

  const nodes = adaptor.childNodes(adaptor.body(html.document));

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        rowGap: 15,
        columnGap: 5,
        justifyContent: "flex-start",
        alignItems: "flex-end",
      }}
    >
      {nodes?.map((item, index) => (
        <GenerateTextComponent
          key={index}
          textStyle={textStyle}
          item={item}
          index={index}
          fontSize={fontSize}
          color={color}
          scrollBorderColor={scrollBorderColor}
          scrollIconColor={scrollIconColor}
        />
      ))}
    </View>
  );
};

export const MathJaxSvg = memo((props) => {
  const textext = props.children || "";
  const fontSize = props.fontSize ? props.fontSize / 2 : 14;
  const color = props.color ? props.color : "black";
  const fontCache = props.fontCache;
  const style = props.style ? props.style : null;
  const scrollIconColor = props.scrollIconColor
    ? props.scrollIconColor
    : "white";
  const scrollBorderColor = props.scrollBorderColor
    ? props.scrollBorderColor
    : "white";

  return (
    <View style={{ flexWrap: "wrap", ...style }}>
      {textext ? (
        <ConvertToComponent
          textStyle={props.textStyle}
          fontSize={fontSize}
          color={color}
          texString={textext}
          fontCache={fontCache}
          scrollBorderColor={scrollBorderColor}
          scrollIconColor={scrollIconColor}
        />
      ) : null}
    </View>
  );
});
