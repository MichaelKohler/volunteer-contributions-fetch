// These fixtures are minified and do not reflect all real attributes and tags.

export const firstPage = `
  <osm version="0.6" generator="OpenStreetMap server" copyright="OpenStreetMap and contributors" attribution="http://www.openstreetmap.org/copyright" license="http://opendatacommons.org/licenses/odbl/1-0/">
    ${Array(100)
      .fill(0)
      .map(
        (_value, index) => `
        <changeset id="${index + 1}" created_at="2024-12-29T12:53:41Z">
          <tag k="comment" v="Some test description ${index + 1}"/>
          <tag k="host" v="https://www.openstreetmap.org/edit"/>
          <tag k="source" v="survey"/>
        </changeset>
      `
      )
      .join()}
  </osm>
`;

export const secondPage = `
  <osm version="0.6" generator="OpenStreetMap server" copyright="OpenStreetMap and contributors" attribution="http://www.openstreetmap.org/copyright" license="http://opendatacommons.org/licenses/odbl/1-0/">
    <changeset id="101" created_at="2024-12-29T12:53:41Z">
      <tag k="comment" v="Some test description 101"/>
      <tag k="host" v="https://www.openstreetmap.org/edit"/>
      <tag k="source" v="survey"/>
    </changeset>
  </osm>
`;
