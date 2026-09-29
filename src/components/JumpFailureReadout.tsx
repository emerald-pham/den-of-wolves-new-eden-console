export default function JumpFailureReadout({ upgraded = false }: { readonly upgraded?: boolean }) {
  return <p>{upgraded
    ? 'If the Jump Drive is damaged, a jump fails on a roll of 1 when upgraded.'
    : 'If the Jump Drive is damaged, a jump fails on a roll of 1–3.'}</p>;
}
