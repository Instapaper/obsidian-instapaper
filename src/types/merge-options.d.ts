declare module "merge-options" {
	function mergeOptions<T>(...options: Partial<T>[]): T;
	export default mergeOptions;
}
