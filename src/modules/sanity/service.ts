import {
  Logger,
  ProductDTO,
} from "@medusajs/framework/types"
import {
  FirstDocumentMutationOptions,
  SanityClient,
  createClient
} from "@sanity/client"


const SyncDocumentTypes = {
  PRODUCT: "product",
} as const

type SyncDocumentTypes =
  (typeof SyncDocumentTypes)[keyof typeof SyncDocumentTypes];

type ModuleOptions = {
  api_token: string;
  project_id: string;
  api_version: string;
  dataset: "production" | "development";
  type_map?: Record<SyncDocumentTypes, string>;
  studio_url?: string;
}


type InjectedDependencies = {
  logger: Logger
};

type SyncDocumentInputs<T> = T extends "product"
  ? ProductDTO
  : never

type TransformationMap<T> = Record<
  SyncDocumentTypes,
  (data: SyncDocumentInputs<T>) => any
>;



class SanityModuleService {
  private client: SanityClient
  private studioUrl?: string
  private logger: Logger
  private typeMap: Record<SyncDocumentTypes, string>
  private createTransformationMap: TransformationMap<SyncDocumentTypes>
  private updateTransformationMap: TransformationMap<SyncDocumentTypes>

  constructor({
    logger,
  }: InjectedDependencies, options: ModuleOptions) {
    this.client = createClient({
      projectId: options.project_id,
      apiVersion: options.api_version,
      dataset: options.dataset,
      token: options.api_token,
    })
    this.logger = logger

    this.logger.info("Connected to Sanity")

    this.studioUrl = options.studio_url

    this.typeMap = Object.assign(
      {},
      {
        [SyncDocumentTypes.PRODUCT]: "product",
      },
      options.type_map || {}
    )

    this.createTransformationMap = {
      [SyncDocumentTypes.PRODUCT]: this.transformProductForCreate,
    }

    this.updateTransformationMap = {
      [SyncDocumentTypes.PRODUCT]: this.transformProductForUpdate,
    }


  }

  private transformProductForCreate = (product: ProductDTO) => {
    this.logger.info(`Creating Sanity document for product: ${product.id}`);
    return {
      _type: this.typeMap[SyncDocumentTypes.PRODUCT],
      _id: product.id, // Use Medusa's ID as Sanity document ID
      medusaId: product.id, // Store explicit reference to Medusa ID
      title: product.title,
      description: product.description || "",
      // Initialize localized fields with default values - only populate English from Medusa
      localizedTitles: {
        en: product.title, // Set English title from Medusa product title
        pl: "", // Initialize empty for other languages
        fr: "",
      },
      localizedDescriptions: {
        en: product.description || "",
        pl: "",
        fr: "",
      },
      localizedShortDescriptions: {
        en: "",
        pl: "",
        fr: "",
      },
      // Initialize empty objects for fields that will be managed in Sanity only
      materials: {
        en: "",
        pl: "",
        fr: "",
      },
      colors: {
        en: "",
        pl: "",
        fr: "",
      },
      // Initialize other Sanity-only fields
      brand: "",
      productionYear: null,
      specs: [
        {
          _key: product.id,
          _type: "spec",
          title: product.title,
          lang: "en",
        },
      ],
    }
  }

  private transformProductForUpdate = (product: ProductDTO) => {
    this.logger.info(`Updating Sanity document for product: ${product.id}`);
    
    // Only update fields that come from Medusa
    const updateData: any = {
      title: product.title,
      medusaId: product.id,
      "localizedTitles.en": product.title, // Update English title
    }
    
    // Only include description if it exists
    if (product.description) {
      updateData.description = product.description;
      updateData["localizedDescriptions.en"] = product.description;
    }
    
    return {
      set: updateData,
    }
  }

  async upsertSyncDocument<T extends SyncDocumentTypes>(
    type: T,
    data: SyncDocumentInputs<T>
  ) {
    this.logger.info(`Checking if document ${data.id} exists in Sanity`);
    try {
      const existing = await this.client.getDocument(data.id);
      
      if (existing) {
        this.logger.info(`Document ${data.id} exists, updating`);
        return await this.updateSyncDocument(type, data);
      }

      this.logger.info(`Document ${data.id} does not exist, creating`);
      return await this.createSyncDocument(type, data);
    } catch (error) {
      this.logger.error(`Error in upsertSyncDocument for ${data.id}: ${error.message}`);
      throw error;
    }
  }

  async createSyncDocument<T extends SyncDocumentTypes>(
    type: T,
    data: SyncDocumentInputs<T>,
    options?: FirstDocumentMutationOptions
  ) {
    this.logger.info(`Creating document in Sanity for ${type}: ${data.id}`);
    try {
      const doc = this.createTransformationMap[type](data);
      this.logger.debug(`Document transform result: ${JSON.stringify(doc)}`);
      const result = await this.client.create(doc, options);
      this.logger.info(`Successfully created document ${data.id} in Sanity`);
      return result;
    } catch (error) {
      this.logger.error(`Error creating document ${data.id} in Sanity: ${error.message}`);
      throw error;
    }
  }

  async updateSyncDocument<T extends SyncDocumentTypes>(
    type: T,
    data: SyncDocumentInputs<T>
  ) {
    this.logger.info(`Updating document in Sanity for ${type}: ${data.id}`);
    try {
      const operations = this.updateTransformationMap[type](data);
      this.logger.debug(`Update operations: ${JSON.stringify(operations)}`);
      const result = await this.client.patch(data.id, operations).commit();
      this.logger.info(`Successfully updated document ${data.id} in Sanity`);
      return result;
    } catch (error) {
      this.logger.error(`Error updating document ${data.id} in Sanity: ${error.message}`);
      throw error;
    }
  }

  async retrieve(id: string) {
    return this.client.getDocument(id)
  }

  async delete(id: string) {
    return this.client.delete(id)
  }

  async update(id: string, data: any) {
    return await this.client.patch(id, {
      set: data,
    }).commit()
  }

  async list(
    filter: {
      id: string | string[]
    }
  ) {
    const data = await this.client.getDocuments(
      Array.isArray(filter.id) ? filter.id : [filter.id]
    )

    return data.map((doc) => ({
      id: doc?._id,
      ...doc,
    }))
  }

  async getStudioLink(
    type: string,
    id: string,
    config: { explicit_type?: boolean } = {}
  ) {
    const resolvedType = config.explicit_type ? type : this.typeMap[type]
    if (!this.studioUrl) {
      throw new Error("No studio URL provided")
    }
    return `${this.studioUrl}/structure/${resolvedType};${id}`
  }



}

export default SanityModuleService