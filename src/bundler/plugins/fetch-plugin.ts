import * as esbuild from "esbuild-wasm";
import axios from "axios";
import localForage from "localforage";

const fileCache = localForage.createInstance({
  name: "filecache",
});

export const fetchPlugin = (inputCode: string) => {
  return {
    name: "fetch-plugin",
    setup(build: esbuild.PluginBuild) {
      // OnLoad is responsible for loading/getting the packages from the file system or url in this case becuase we are overiding the behavior in this case, and path/url from the pachage is provided by the onResolve function through arg.path
      // All the onLoad functions are going to run one by one, given the file path passes the filter

      // Handling index.js the first file that bundler is going to look at
      build.onLoad({ filter: /(^index\.js$)/ }, () => {
        return {
          loader: "jsx",
          contents: inputCode,
        };
      });

      // Handling all the files and checking if they already exist in DB index with the help of localforge package
      build.onLoad({ filter: /.*/ }, async (args: any) => {
        const cachedResult = await fileCache.getItem<esbuild.OnLoadResult>(
          args.path
        );

        if (cachedResult) {
          return cachedResult;
        }
      });

      // Handling bulma css files and appending the css into head of index.js
      build.onLoad({ filter: /.css$/ }, async (args: any) => {
        const { data, request } = await axios.get(args.path);
        const escaped = data
          .replace(/\n/g, "")
          .replace(/"/g, '\\"')
          .replace(/'/g, "\\'");
        const contents = `
          const style = document.createElement('style');
          style.innerText = '${escaped}';
          document.head.appendChild(style);
        `;

        const result: esbuild.OnLoadResult = {
          loader: "jsx", // because esbuild does not understand/work on css files therefore setting all the css data using jsx into the,header, it tries to read css file as it is a js file
          contents,
          resolveDir: new URL("./", request.responseURL).pathname,
        };
        // This is responsible for storing the fetched css files into DB index
        await fileCache.setItem(args.path, result);

        return result;
      });

      // This is responsible for sending request to unpackage and getting the required packages
      build.onLoad({ filter: /.*/ }, async (args: any) => {
        const { data, request } = await axios.get(args.path);
        // console.log(new URL('./', request.responseURL).pathname);

        const result: esbuild.OnLoadResult = {
          loader: "jsx",
          contents: data,
          resolveDir: new URL("./", request.responseURL).pathname, // this directory is provided to next file that we try to fetch/require and given to onResolve function
        };
        // This is responsible for storing the fetched packaged into DB index
        await fileCache.setItem(args.path, result);

        return result;
      });
    },
  };
};
