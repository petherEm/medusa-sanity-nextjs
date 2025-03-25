import { Module } from "@medusajs/framework/utils"
import SanityModuleService from "./service"

export const SANITY_MODULE = "sanity"

export const config = {
  service: {
    resolve: SanityModuleService,
    deps: {
      logger: "logger",
    },
    definition: {
      registrationName: SANITY_MODULE, // Ensure the service is registered as 'sanity'
    },
    options: ({
      projectConfig
    }) => {
      return {
        api_token: process.env.SANITY_API_TOKEN,
        project_id: process.env.SANITY_PROJECT_ID,
        api_version: process.env.SANITY_API_VERSION || new Date().toISOString().split('T')[0],
        dataset: process.env.SANITY_DATASET || "production",
        studio_url: process.env.SANITY_STUDIO_URL || "http://localhost:3000/studio",
        type_map: {
          product: "product",
        },
      };
    },
  },
};

export default Module(SANITY_MODULE, {
  service: SanityModuleService,
})