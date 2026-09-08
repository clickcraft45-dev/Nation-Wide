/**
 * Renders a JSON-LD block.
 *
 * dangerouslySetInnerHTML is required — React escapes text children, and an escaped `&` or `<`
 * inside JSON breaks the parser, so a normal `{JSON.stringify(...)}` child produces markup that
 * Google silently fails to read. The content is our own serialised object, never user input.
 *
 * `<` is escaped anyway as defence in depth: if a value ever came from the database (a review, a
 * service name an admin typed), an embedded `</script>` would otherwise close this tag early and
 * turn the rest into live markup.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
