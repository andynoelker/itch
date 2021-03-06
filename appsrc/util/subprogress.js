
/**
 * Returns a function that, when called, calls onprogress
 * with an find object that has a percent value scaled to go from
 * start to end.
 *
 * Example:
 *
 *   // from 20% to 40%, we do that
 *   await subtask(src, dst, {onprogress: subprogress(onprogress, 20, 40)})
 */
module.exports = function subprogress (onprogress, start_percent, end_percent) {
  let start_alpha = start_percent / 100
  let end_alpha = end_percent / 100
  let span_alpha = end_alpha - start_alpha

  return function (info) {
    let inner_alpha = info.percent / 100
    let percent = (start_alpha + inner_alpha * span_alpha) * 100
    onprogress({percent})
  }
}
