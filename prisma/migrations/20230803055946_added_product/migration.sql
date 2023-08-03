-- CreateTable
CREATE TABLE `product` (
    `product_code` VARCHAR(191) NOT NULL,
    `product_name` VARCHAR(100) NOT NULL,
    `price` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`product_code`(7))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
