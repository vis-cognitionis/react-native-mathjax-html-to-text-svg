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

const GenerateSvgComponent = ({ item, fontSize, color }) => {
  let svgText = adaptor.innerHTML(item);

  const [width, height] = getScale(svgText);

  svgText = svgText.replace(/font-family=\"([^\"]*)\"/gim, "");
  svgText = svgText.replace(
    /<rect/g,
    '<rect fill="transparent" stroke="white" stroke-width="30" '
  );
  //to hide for tables
  svgText = svgText.replace(/<g[^>]*data-mml-node="merror"[^>]*>/g, "");
  svgText = svgText.replace(/fill="([^\"]*)"/gim, `fill=${color}`);

  svgText = svgText.replace(/\\llbracket/g, "⟦");
  svgText = svgText.replace(/\\rrbracket/g, "⟧");

  svgText = applyScale(svgText, [(width * fontSize) / 1.1, height * fontSize]);
  svgText = applyColor(svgText, color);

  return (
    <Text allowFontScaling={false}>
      <SvgFromXml xml={svgText} />
    </Text>
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

  const cleanText = text
    ?.split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .join("\n")
    .replace(/\.\n/g, ".\n ") //move down one line after the dot mark.
    .replace(/hline/g, "")
    .replace(/end{tabular}/g, "")
    .replace(/begin{tabular}/g, "")
    .replace(/\\/g, "")
    .replace(/\*\*(.*?)\*\*/g, (_, p1) => `@+${p1}@+`)
    .replace(/###(.*?)/g, (_, p1) => `@+${p1}@+`)
    .replace(/##(.*?)/g, (_, p1) => `@+${p1}@+`)
    .replace(/#(.*?)/g, (_, p1) => `@+${p1}@+`);

  const content = !!cleanText ? (
    <Text
      allowFontScaling={false}
      key={`sub-${index}`}
      style={[
        {
          fontSize: fontSize * 2,
          display: cleanText?.trim() === "" ? "none" : "flex",
          maxHeight: "auto",
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
            <Text key={`bold-${i}`} style={{ fontWeight: "700" }}>
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
      ? Number((item?.children[0]?.attributes?.width).split("ex")[0])
      : 1;

  const checkWidth = Boolean(svgItemWidth > 40);

  const containerStyle = {
    alignSelf: "baseline",
    height: "auto",
    display: text?.trim() === "" ? "none" : "flex",
    marginVertical: 1,
    flexGrow: 1,
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
      <ScrollView
        horizontal={true}
        contentContainerStyle={containerStyle}
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
        flexDirection: "column",
        flexWrap: "wrap",
        gap: 5,
        alignItems: "flex-start",
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
