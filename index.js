import React, { memo } from "react";
import {
  ScrollView,
  Text,
  TouchableWithoutFeedback,
  View,
  StyleSheet,
} from "react-native";
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

const GenerateSvgComponent = ({ item, fontSize, color, styles }) => {
  let svgText = adaptor.innerHTML(item);

  const [width, height] = getScale(svgText);

  svgText = svgText.replace(/font-family=\"([^\"]*)\"/gim, "");
  svgText = svgText.replace(
    /<rect[^>]*data-frame="true"[^>]*>/g,
    '<rect fill="transparent" stroke="white" stroke-width="30">'
  );

  //to hide for rects
  svgText = svgText.replace(/<g[^>]*data-mml-node="merror"[^>]*>/g, "");

  // to remove unnecessary parentheses
  svgText = svgText.replace(/\\llbracket/g, "⟦");
  svgText = svgText.replace(/\\rrbracket/g, "⟧");
  svgText = svgText.replace(/\\\]/g, "");
  svgText = svgText.replace(/\\\(/g, "");
  svgText = svgText.replace(/\\\)/g, "");

  svgText = applyScale(svgText, [(width * fontSize) / 1, height * fontSize]);
  svgText = applyColor(svgText, color);

  return (
    <View
      style={[
        styles.mathSvgs,
        {
          minWidth: height > 8 ? "100%" : "auto",
        },
      ]}
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
  scrollBorderColor,
  scrollIconColor,
  styles,
}) => {
  let rnStyle = null;
  let text = null;

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

  const cleanText = text
    ?.split(/\r?\n/) // split the text into lines
    .filter((line) => line.trim() !== "") // remove empty lines
    .join("\n") // join the lines back together
    .replace(/\\/g, "") // remove backslashes ('\')
    .replace(
      /(?<!\S)\*\*(?!\S)|(?<!\S)[*:]+(?!\S)|(?<!\S)\*\*[^\S\n]*\*\*(?!\S)|\|\s*([a-zA-Z0-9]+\))/g,
      "$1"
    ) // remove single punctuation marks
    .replace(/^\s*[\p{P}\p{S}]\s*[\p{P}\p{S}]\s*$/gmu, "") // remove specific patterns like ): or ).
    .replace(/-{2,}/g, "") // remove standalone triple dashes
    .replace(/^\s*\*\*\.\s*$/gm, "") // remove standalone **. marks
    .trim(); // trim leading and trailing whitespace

  const formatTextForReactNative = () => {
    const lines = cleanText?.split("\n");
    const formattedComponents = [];

    let inTable = false;
    let tableRows = [];
    let isFirstRow = true;
    let maxCellWidth = 0;

    const calculateMaxCellWidth = (cells) => {
      let maxWidth = 0;
      cells.forEach((cell) => {
        const cellWidth = cell.trim().length * 10;
        if (cellWidth > maxWidth) {
          maxWidth = cellWidth;
        }
      });
      return maxWidth;
    };

    lines?.forEach((line, index) => {
      // process headings
      if (line.startsWith("#")) {
        const level = line.match(/^#+/)[0].length;
        const content = line.replace(/^#+\s*/, "");
        const contentWithBold = content
          .split(/\*\*(.*?)\*\*/)
          .map((part, index) =>
            index % 2 === 1 ? (
              <Text key={index} style={{ fontWeight: "bold" }}>
                {part}
              </Text>
            ) : (
              part
            )
          );

        formattedComponents.push(
          content ? (
            <Text key={index} style={styles[`heading${level}`]}>
              {contentWithBold}
            </Text>
          ) : null
        );
      }

      // process tables
      else if (line?.trim().startsWith("|") && line.trim().endsWith("|")) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
          isFirstRow = true;
        }
        if (line.includes("---")) {
          // skip heading separator line
          return;
        }

        const cells = line?.split("|").filter((cell) => cell.trim() !== "");
        // Calculate the max cell width
        const rowMaxWidth = calculateMaxCellWidth(cells);
        if (rowMaxWidth > maxCellWidth) {
          maxCellWidth = rowMaxWidth; // Keep track of the largest width overall
        }

        const rowStyle = isFirstRow
          ? [styles.tableRow, styles.tableHeader]
          : styles.tableRow;

        tableRows.push(
          <View key={`row-${index}`} style={rowStyle}>
            {cells.map((cell, cellIndex) => {
              const boldCell = cell.includes("**") ? (
                <Text style={styles.bold}>
                  {cell.replace(/\*\*/g, "").trim()}
                </Text>
              ) : (
                cell.trim()
              );

              return (
                <Text
                  key={`cell-${index}-${cellIndex}`}
                  style={[
                    styles.tableCell,
                    { minWidth: maxCellWidth },
                    isFirstRow && styles.firstRow,
                  ]}
                >
                  {boldCell}
                </Text>
              );
            })}
          </View>
        );
        isFirstRow = false;
      } else {
        // If we were in a table, push the collected table rows as a component
        if (inTable) {
          formattedComponents.push(
            <ScrollView
              horizontal
              key={`table-${index}`}
              style={{ width: "100%", minWidth: "100%" }}
            >
              <View style={styles.table}>{tableRows}</View>
            </ScrollView>
          );
          inTable = false;
          tableRows = [];
        }

        // process normal paragraphs
        if (line?.trim() !== "") {
          const parts = line?.split(
            /(\*\*.*?\*\*|\*.*?\*)|(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu
          );

          const formattedLine = parts.map((part, partIndex) => {
            if (part && part.startsWith("**") && part.endsWith("**")) {
              return (
                <Text key={`bold-${index}-${partIndex}`} style={styles.bold}>
                  {part.replace(/^\*\*|\*\*$/g, "")}
                </Text>
              );
            } else if (
              part &&
              /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/u.test(part)
            ) {
              return (
                <Text key={`emoji-${index}-${partIndex}`} style={styles.emoji}>
                  {part}
                </Text>
              );
            } else if (part && part.startsWith("*") && part.endsWith("*")) {
              return (
                <Text
                  key={`italic-${index}-${partIndex}`}
                  style={styles.italic}
                >
                  {part.replace(/^\*|\*$/g, "")}
                </Text>
              );
            }

            // regex to match list numbering patterns like "1.", "a)", "IV.", etc.
            const listNumberingRegex =
              /^\s*[0-9]+\.\s|^\s*[a-zA-Z]\)\s|^\s*[IVXLCDM]+\.\s/;

            if (listNumberingRegex.test(part?.trim())) {
              return (
                <Text
                  key={`bold-number-${index}-${partIndex}`}
                  style={styles.bold}
                >
                  {part.replace(/\*\*/g, "")}
                </Text>
              );
            }

            return <Text key={`part-${index}-${partIndex}`}>{part}</Text>;
          });

          const regex =
            /^(?:[A-Za-z]+[):,]|[IVXLCDM]+[.:,]|[0-9]+[):,]|.*(?<!^)[,:)](?=\s|$))\s*/gm;
          const result = regex.test(text);

          formattedComponents.push(
            <Text
              key={index}
              style={[
                styles.paragraph,
                result && {
                  width: "100%",
                },
              ]}
            >
              {formattedLine}
            </Text>
          );
        }
      }
    });

    // If the text ends with a table, ensure it's added
    if (inTable) {
      formattedComponents.push(
        <ScrollView
          horizontal
          key="last-table"
          style={{ width: "100%", minWidth: "100%" }}
        >
          <View style={styles.table}>{tableRows}</View>
        </ScrollView>
      );
    }

    return formattedComponents;
  };

  const formattedComponents = formatTextForReactNative(text);

  const content = !!text ? (
    <View style={styles.formattedTextStyles}>{formattedComponents}</View>
  ) : item?.kind === "mjx-container" ? (
    <GenerateSvgComponent
      key={`sub-${index}`}
      item={item}
      fontSize={fontSize}
      color={color}
      styles={styles}
    />
  ) : null;

  const svgItemWidth =
    item &&
    item?.children !== undefined &&
    item.children[0].attributes?.width !== undefined
      ? Number(item?.children[0]?.attributes?.width.split("ex")[0])
      : 1;

  const checkWidth = Boolean(svgItemWidth > 35);

  if (item?.kind === "mjx-container" && checkWidth) {
    return (
      <View style={{ flexDirection: "row", width: "100%" }}>
        <ScrollView
          horizontal={true}
          scrollIndicatorInsets={{ top: 30 }}
          showsHorizontalScrollIndicator={false}
          persistentScrollbar={false}
        >
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.scrollContainerStyle,
                {
                  borderColor: scrollBorderColor,
                },
              ]}
            >
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
    return <View>{content}</View>;
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
  styles,
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
    <View style={styles.container}>
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
          styles={styles}
        />
      ))}
    </View>
  );
};

export const MathJaxSvg = memo((props) => {
  const textext = props.children || "";
  const fontSize = props.fontSize ? props.fontSize / 2 : 14;
  const color = props.color ? props.color : "white";
  const fontCache = props.fontCache;
  const style = props.style ? props.style : null;
  const scrollIconColor = props.scrollIconColor
    ? props.scrollIconColor
    : "white";
  const scrollBorderColor = props.scrollBorderColor
    ? props.scrollBorderColor
    : "white";

  const defaultStyles = StyleSheet.create({
    container: {
      flexDirection: "row",
      flexWrap: "wrap",
      rowGap: 15,
      columnGap: 5,
      justifyContent: "flex-start",
      alignItems: "center",
      // borderColor: "yellow",
      // borderWidth: 1
    },
    mathSvgs: {
      // borderColor: "blue",
      // borderWidth: 1,
      flexDirection: "row",
      alignSelf: "center",
      marginHorizontal: 5,
    },
    formattedTextStyles: {
      flexDirection: "row",
      maxWidth: "100%",
      flexWrap: "wrap",
      width: "100%",
      // borderColor:"red",
      // borderWidth:1
    },
    scrollContainerStyle: {
      flexDirection: "row",
      borderWidth: 1,
      borderStyle: "dashed",
      borderTopLeftRadius: 8,
      borderBottomLeftRadius: 8,
      paddingVertical: 10,
      paddingRight: 10,
    },
    heading1: {
      fontSize: 20,
      fontWeight: "bold",
      marginVertical: 14,
      color: "white",
      width: "100%",
      flexWrap: "wrap",
    },
    heading2: {
      fontSize: 18,
      fontWeight: "bold",
      marginVertical: 14,
      color: "white",
      width: "100%",
      flexWrap: "wrap",
    },
    heading3: {
      fontSize: 16,
      fontWeight: "bold",
      marginVertical: 10,
      color: "white",
      width: "100%",
      textDecorationStyle: "solid",
      textDecorationLine: "underline",
      flexWrap: "wrap",
    },
    heading4: {
      fontSize: 16,
      fontWeight: "bold",
      marginVertical: 10,
      color: "white",
      width: "100%",
      flexWrap: "wrap",
    },
    paragraph: {
      // color: "pink",
      // fontFamily: "Times New Roman",
      // borderColor: "orange",
      // borderWidth: 1,
      color: "white",
      fontSize: 16,
      maxWidth: "100%",
      minWidth: "auto",
      width: "auto",
      lineHeight: 21,
      marginVertical: 5,
      display: "flex",
      flexWrap: "nowrap",
    },
    bold: {
      fontWeight: "bold",
      color: "white",
      fontSize: 16,
      flexWrap: "wrap",
      // width: "100%",
      // minWidth: "100%",
      // borderColor: "orange",
      // borderWidth: 1,
    },
    italic: {
      fontStyle: "italic",
      color: "white",
    },
    table: {
      borderWidth: 0.5,
      borderColor: "#FFFFFF4D",
      margin: 5,
      color: "white",
    },
    tableRow: {
      flexDirection: "row",
      color: "white",
    },
    tableHeader: {
      color: "white",
      fontWeight: "bold",
    },
    tableCell: {
      width: "auto",
      display: "flex",
      paddingVertical: 4,
      paddingLeft: 4,
      borderWidth: 1,
      borderColor: "#FFFFFF4D",
      backgroundColor: "transparent",
      color: "white",
    },
    firstRow: {
      fontWeight: "bold",
      flex: 1,
      width: "auto",
      backgroundColor: "#E6D19033",
    },
  });

  // Merge default styles with user-provided styles
  const mergeStyles = (defaultStyles, customStyles = {}) => {
    const merged = {};
    for (const key in defaultStyles) {
      if (defaultStyles.hasOwnProperty(key)) {
        merged[key] = { ...defaultStyles[key], ...(customStyles[key] || {}) };
      }
    }
    return merged;
  };

  const mergedStyles = mergeStyles(defaultStyles, props.styles || {});

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
          styles={mergedStyles}
        />
      ) : null}
    </View>
  );
});
